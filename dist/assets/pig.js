function nextTag(dataset, offset) {
  const tag = dataset.slice(offset, offset + 4);
  offset += 4; // Skip tag
  const VR = String.fromCharCode.apply(null, dataset.slice(offset, offset + 2));
  offset += 2; // Skip VR
  if (['OB', 'OD', 'OF', 'OL', 'OW', 'SQ', 'UC', 'UR', 'UT', 'UN'].includes(VR)) {
    // These VR types handles themselves differently. They have 2 reserved bytes
    // that need to be skipped and their data length is on 4 bytes.
    offset += 2 // Skip reserved byte
    if (VR === 'SQ') { // Sequence are s special type within those specials types... yikes.
      // See http://dicom.nema.org/dicom/2013/output/chtml/part05/sect_7.5.html on
      // how a sequence look like in a DICOM file. Let's throw an error for now.
      throw new Error('Oops, we do not deal with SeQuence fields for now... :/');
    }
    length = dataset[offset] +
      (dataset[offset + 1] << 8) +
      (dataset[offset + 2] << 16) +
      (dataset[offset + 3] << 24);
    offset += 4; // Skip length
  } else {
    // The tag with "regular" VR have 2 byte long datalength field.
    length = dataset[offset] + (dataset[offset + 1] << 8);
    offset += 2; // Skip length
  }
  const dataOffset = offset;
  return {
    tag, VR, length, dataOffset
  };
}

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

function twoBytesToNumber(arrayBuffer) {
  return (arrayBuffer[1] << 8) | arrayBuffer[0];
}

async function pig() {
  const response = await fetch('../assets/IM0257_0');
  const dataset = new Uint8Array(await response.arrayBuffer());
  window.dataset = dataset;
  console.log('Study Data', String.fromCharCode.apply(null, getTag(dataset, '00080020')));
  console.log('Manufacturer', String.fromCharCode.apply(null, getTag(dataset, '00080070')));
  const BitsAllocated = twoBytesToNumber(getTag(dataset, '00280100'));
  console.log('BitsAllocated', BitsAllocated);
  const BitsStored = twoBytesToNumber(getTag(dataset, '00280101'));
  console.log('BitsStored', BitsStored);
  const PixelRepresentation = twoBytesToNumber(getTag(dataset, '00280103'));
  console.log('PixelRepresentation', PixelRepresentation);


  window.bitsAllocated = twoBytesToNumber(getTag(dataset, '00280100'));
  window.rescaleIntercept = parseInt(String.fromCharCode.apply(null, getTag(dataset, '00281052')), 10);
  window.rescaleSlope = parseInt(String.fromCharCode.apply(null, getTag(dataset, '00281053')), 10);
  window.windowCenter = String.fromCharCode.apply(null, getTag(dataset, '00281050')).split('\\').map(parseInt)[0];
  window.windowWidth = String.fromCharCode.apply(null, getTag(dataset, '00281051')).split('\\').map(parseInt)[0];
  window.rows = twoBytesToNumber(getTag(dataset, '00280010'));
  window.columns = twoBytesToNumber(getTag(dataset, '00280011'));
  if (bitsAllocated !== 16) {
    throw new Error('Oh no, not a 16 bits dataset!');
  }
  window.pixels = new Uint16Array(getTag(dataset, '7FE00010').buffer);

  window.imageBuffer = new Uint8ClampedArray(pixels.map(p => {
    // Apply modality LUT
    const hu = p * rescaleSlope + rescaleIntercept;
    const lowerBound = windowCenter - windowWidth / 2;
    // Apply VOI LUT
    const higherBound = windowCenter + windowWidth / 2;
    if (hu < lowerBound) {
      return 0;
    } else if (hu > higherBound) {
      return 255;
    } else {
      return (hu - lowerBound) / (higherBound - lowerBound) * 255;
    }
  }));
  window.imageData = new ImageData(columns, rows);
  imageBuffer.forEach((pixel, index) => {
    imageData.data[index * 4    ] = pixel; // R
    imageData.data[index * 4 + 1] = pixel; // G
    imageData.data[index * 4 + 2] = pixel; // B
    imageData.data[index * 4 + 3] = 255; // A
  });
  window.canvas = document.createElement('canvas');
  window.canvas.width = columns;
  window.canvas.height = columns;
  window.ctx = canvas.getContext('2d');
  window.ctx.putImageData(imageData, 0, 0);
  document.body.appendChild(canvas);
}
