/**
 * Copyright (c) 2015 Jean-Daniel Michaud.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, version 3.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

// Helper function. Returns the next tag starting at offset.
function nextTag(dataset, offset) {
  const tag = dataset.slice(offset, offset + 4);
  offset += 4; // Skip tag
  const VR = String.fromCharCode.apply(null, dataset.slice(offset, offset + 2));
  offset += 2; // Skip VR
  let length = 0;
  if (['OB', 'OD', 'OF', 'OL', 'OW', 'SQ', 'UC', 'UR', 'UT', 'UN'].includes(VR)) {
    // These VR types handles themselves differently. They have 2 reserved bytes
    // that need to be skipped and their data length is on 4 bytes.
    offset += 2 // Skip reserved byte
    if (VR === 'SQ' &&
        dataset[offset]     === 0xFF && dataset[offset + 1] === 0xFF &&
        dataset[offset + 2] === 0xFF && dataset[offset + 3] === 0xFF) {
      // If the sequence tag is followed by 0xFFFFFFFF, it is a sequence with
      // implicit length type. In that case, we look for the end of the sequence
      // (0xFFFEE0DD) and skip it.
      for (let i = offset; i < dataset.length; ++i) {
        if (dataset[i]     === 0xFE && dataset[i + 1] === 0xFF &&
            dataset[i + 2] === 0xDD && dataset[i + 3] === 0xE0) {
          length = (i + 8) - offset; // 4 bytes for the end tag + 4 bytes padding.
          break;
        }
      }
    } else {
      length = dataset[offset] +
        (dataset[offset + 1] << 8) +
        (dataset[offset + 2] << 16) +
        (dataset[offset + 3] << 24);
      offset += 4; // Skip length
    }
  } else {
    // The tag with "regular" VR have 2 bytes long datalength field.
    length = dataset[offset] + (dataset[offset + 1] << 8);
    offset += 2; // Skip length
  }
  const dataOffset = offset;
  return {
    tag, VR, length, dataOffset
  };
}

/**
 * Return the value of a tag from a dataset.
 * @param  {Uint8Array} dataset The dataset set as on disk.
 * @param  {string} tag     A string containing the group and tag, eg: '00280100'.
 * @return {string}         The content of the field as an Uint8Array.
 */
function getTag(dataset, tag) {
  // Convert the convenint string format to a binary array.
  // Flipping the element to match the endianess of the DICOM file.
  const binTag = [
    parseInt(tag.substring(2, 4), 16),
    parseInt(tag.substring(0, 2), 16),
    parseInt(tag.substring(6, 8), 16),
    parseInt(tag.substring(4, 6), 16),
  ];
  // Assuming a nice DICOM file. We skip the first 128 bytes, then the "DICM"
  // flag. Then will fast forward the header (assuming an explicit VR type)
  let offset = 128 + 'DICM'.length;
  let dataElement;
  do {
    dataElement = nextTag(dataset, offset);
    offset = dataElement.dataOffset + dataElement.length;
    if (offset > dataset.length) throw new Error('reach end of file');
  } while (
    // While we don't reach the end of the file
    offset < dataset.length &&
    // and as long as we have not found our tag, we will jump to the next one.
    !(dataElement.tag[0] === binTag[0] &&
      dataElement.tag[1] === binTag[1] &&
      dataElement.tag[2] === binTag[2] &&
      dataElement.tag[3] === binTag[3])
  );
  // Return a slice of the data containing the value. Up to the called
  // to format to the proper type.
  return dataset.slice(dataElement.dataOffset, dataElement.dataOffset + dataElement.length);
}

/**
 * Convert a Uint8Array of two elements to a number.
 * @param  {Uint8Array} buffer An Uint8Array of at least two elements.
 * @return {number}            A number
 */
function twoBytesToNumber(buffer) {
  return (buffer[1] << 8) | buffer[0];
}

/**
 * Drag & drop management.
 */
function handleDragOver(event) {
  event.stopPropagation();
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy'; // Explicitly show this is a copy.
}

/**
 * Drag & drop management.
 */
async function handleFileDrop(event, canvas) {
  event.preventDefault();
  const items = []
  // First, convert that ugly object to a proper array
  for (let i = 0; i < event.dataTransfer.items.length; ++i) {
    items.push(event.dataTransfer.items[i]);
  }
  // Select only the files
  const files = items
    .filter(item => item.kind === 'file')
    .map(item => item.getAsFile());
  console.log(`${files.length} files dropped`);

  // Parse the files
  const instances = await Promise.all(files.map(file => makeInstance(file)));
  const [volume, ...rest] = findVolume(instances);
  const camera = initCamera(volume, 'CORONAL');
  drawMPR(volume, camera, canvas);
}

/**
 * For each DICOM instance, extract the necessary information.
 * @param  {file} file   The file dropped on the drop-zone.
 * @return {instance}    An object containing the necessary fields for the MPR.
 */
async function makeInstance(file) {
  const dataset = await new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = function() {
      const arrayBuffer = reader.result;
      resolve(new Uint8Array(arrayBuffer));
    }
    reader.readAsArrayBuffer(file);
  });

  const instance = {};
  const bitsAllocated = twoBytesToNumber(getTag(dataset, '00280100'));
  if (bitsAllocated !== 16) {
    throw new Error('not a 16 bits dataset!');
  }
  instance.RescaleIntercept = parseInt(String.fromCharCode.apply(null, getTag(dataset, '00281052')), 10);
  instance.RescaleSlope = parseInt(String.fromCharCode.apply(null, getTag(dataset, '00281053')), 10);
  instance.WindowCenter = String.fromCharCode.apply(null, getTag(dataset, '00281050')).split('\\').map(parseInt)[0];
  instance.WindowWidth = String.fromCharCode.apply(null, getTag(dataset, '00281051')).split('\\').map(parseInt)[0];
  instance.Rows = twoBytesToNumber(getTag(dataset, '00280010'));
  instance.Columns = twoBytesToNumber(getTag(dataset, '00280011'));
  instance.ImagePositionPatient = String.fromCharCode.apply(null, getTag(dataset, '00200032')).split('\\').map(parseFloat);
  instance.ImageOrientationPatient = String.fromCharCode.apply(null, getTag(dataset, '00200037')).split('\\').map(parseFloat)
  instance.PixelSpacing = String.fromCharCode.apply(null, getTag(dataset, '00280030')).split('\\').map(parseFloat)
  instance.InstanceNumber = parseInt(String.fromCharCode.apply(null, getTag(dataset, '00200013')), 10);

  instance.pixels = new Uint16Array(getTag(dataset, '7FE00010').buffer);

  return instance;
}

/**
 * When provided a bunch of instances, we sort them in space and check their
 * instance number to determine if they are part of the same volume. A list of
 * volume is produced which, for most of the time, will have a length of 1.
 * @param  {[instance]} instances list of instances
 * @return {[volume]}             list of volumes
 */
function findVolume(instances) {
  function getInstanceNormal(instance) {
    const imageOrientationX = instance.ImageOrientationPatient.slice(0, 3).transpose().normalize();
    const imageOrientationY = instance.ImageOrientationPatient.slice(3).transpose().normalize();
    return imageOrientationX.cross(imageOrientationY);
  }

  function computeZPos(instances) {
    const normal = getInstanceNormal(instances[0]);
    const normalt = normal.transpose();
    return instances.map(instance => {
      return normalt.dot(instance.ImagePositionPatient);
    });
  }

  function sortInstances(instances) {
    const zpos = computeZPos(instances);
    return instances
      // Zip instances and zpos
      .map((instance, i) => ({ instance, zpos: zpos[i] }))
      // sort them
      .sort((a, b) => a.zpos > b.zpos ? 1 : -1)
      // extract the instances
      .map(x => x.instance);
  }

  instances = sortInstances(instances);
  const volumes = [[instances[0]]];
  instances.slice(1).map(instance => {
    const group = volumes.find(g => {
      const groupInstanceNumber = parseFloat(g[g.length - 1].InstanceNumber);
      // The last instance of the group and the instance are next to each other
      return Math.abs(instance.InstanceNumber - groupInstanceNumber) === 1;
    });
    if (group !== undefined) {
      group.push(instance);
    } else {
      volumes.push([instance]);
    }
  });

  for (const volume of volumes) {
    volume.distanceBetweenSlice = volume[0].ImagePositionPatient
      .sub(volume[1].ImagePositionPatient)
      .norm();
  }

  return volumes
}

/**
 * Initial the camera based on the volume and type (only CORONAL)
 */
function initCamera(volume, type) {
  const volumeCenter = [
    volume[0].PixelSpacing[1] * volume[0].Columns / 2,
    volume[0].PixelSpacing[0] * volume[0].Rows / 2,
    volume.distanceBetweenSlice * volume.length / 2,
  ].add(volume[0].ImagePositionPatient);

  const camera = {};
  switch (type) {
    case 'CORONAL': {
      // The look point sit exactly at the center
      camera.look = volumeCenter;
      // We take the eye one step back above the look point (note the sub 1)
      camera.eye = volumeCenter.sub([0, 1, 0]);
      // Up is toward the head
      camera.up = [0, 0, 1];
      // We want to see our whole volume so we set the FOV to full height
      camera.fov = volume.distanceBetweenSlice * volume.length;
      break;
    }
    default:
      // Manage only CORONAL for now
      throw new Error(`unknown camera type ${type}`);
  }

  return camera;
}

function applyLUT(pixel, RescaleSlope, RescaleIntercept, WindowWidth, WindowCenter) {
  // Apply modality LUT
  const hu = pixel * RescaleSlope + RescaleIntercept;
  const lowerBound = WindowCenter - WindowWidth / 2;
  // Apply VOI LUT
  const higherBound = WindowCenter + WindowWidth / 2;
  if (hu < lowerBound) {
    return 0;
  } else if (hu > higherBound) {
    return 255;
  } else {
    return (hu - lowerBound) / (higherBound - lowerBound) * 255;
  }
}

function drawMPR(volume, camera, canvas) {
  const context = canvas.getContext('2d');
  const { volumeMatrix, cameraMatrix } = computeMatrices(volume, camera);
  const { RescaleSlope, RescaleIntercept, WindowWidth, WindowCenter } = volume[0];
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const image = imageData.data;
  // Prepare a matrix to go from patient CS to volume CS
  const toVolumeMatrix = volumeMatrix.inv();
  // Go through all the camera pixel
  for (let j = 0; j < canvas.height; ++j) {
    const cameraY = j / canvas.height;
    for (let i = 0; i < canvas.width; ++i) {
      const cameraX = i / canvas.width;
      const cameraPoint = [cameraX, cameraY, 0, 1];
      // Convert from Camera CS to Patient CS to Volume CS
      const voxel = toVolumeMatrix.mul(cameraMatrix.mul(cameraPoint));
      // Nearest neighbors interpolation
      voxel.forEach((x, index) => { voxel[index] = Math.round(x) | 0; });
      if (voxel[0] > 0 && voxel[0] < volume[0].Rows &&
          voxel[1] > 0 && voxel[1] < volume[1].Columns &&
          voxel[2] > 0 && voxel[2] < volume.length) {
        // Fetch the value of the voxel in the volume
        const value = volume[voxel[2] | 0].pixels[voxel[1] * volume[0].Rows + voxel[0]];
        // Apply the LUT and set the value to the R, G and B channel of the image
        const offset = (j * canvas.width + i) * 4;
        image[offset] = image[offset + 1] = image[offset + 2] =
          applyLUT(value, RescaleSlope, RescaleIntercept, WindowWidth, WindowCenter);
        image[offset + 3] = 255;
      }
    }
  }
  // Blit the image on the canvas
  context.putImageData(imageData, 0, 0);
}

function computeMatrices(volume, camera) {
  const imageOrientationX = volume[0].ImageOrientationPatient.slice(0, 3).transpose().normalize();
  const imageOrientationY = volume[0].ImageOrientationPatient.slice(3).transpose().normalize();
  const volumeXAxis = imageOrientationX.mul(volume[0].PixelSpacing[1]);
  const volumeYAxis = imageOrientationY.mul(volume[0].PixelSpacing[0]);
  const volumeZAxis = imageOrientationX
    .cross(imageOrientationY)
    .normalize()
    .mul(volume.distanceBetweenSlice);
  const volumeMatrix = [
    [volumeXAxis[0], volumeYAxis[0], volumeZAxis[0], volume[0].ImagePositionPatient[0]],
    [volumeXAxis[1], volumeYAxis[1], volumeZAxis[1], volume[0].ImagePositionPatient[1]],
    [volumeXAxis[2], volumeYAxis[2], volumeZAxis[2], volume[0].ImagePositionPatient[2]],
    [0, 0, 0, 1],
  ];

  const right = camera.look.sub(camera.eye).normalize().cross(camera.up);
  const origin = camera.look
    .add(camera.up.normalize().mul(camera.fov / 2))
    .add(right.normalize().neg().mul(camera.fov / 2));
  const cameraXAxis = right.normalize().mul(camera.fov);
  const cameraYAxis = camera.up.normalize().neg().mul(camera.fov);
  const cameraMatrix = [
    [cameraXAxis[0], cameraYAxis[0], 0, origin[0]],
    [cameraXAxis[1], cameraYAxis[1], 0, origin[1]],
    [cameraXAxis[2], cameraYAxis[2], 0, origin[2]],
    [0, 0, 0, 1],
  ];

  return { volumeMatrix, cameraMatrix };
}

async function main() {
  // Prepare drop-zone
  const canvas = document.getElementById('viewport');
  const dropZone = document.getElementById('drop-zone');
  dropZone.addEventListener('dragover', handleDragOver, false);
  dropZone.addEventListener('drop', (event) => handleFileDrop(event, canvas), false);
}

window.onload = main
