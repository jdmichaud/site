function selectAllChildren(el, list = []) {
  list.push(el);
  el.childNodes.forEach(child => {
    selectAllChildren(child, list);
  })
  return list;
}

// Here we will replace the placeholder with some content. The content comes
// from static file retrieved from the server. The filename to retrieve is
// either directly provided by the placeholder: {{ /header.html }} or by a
// url query: ?article=title.html and then the placeholder {{ article }}.
// A content file shall only contain one node.
async function main() {
  // Retrieve all text node matching {{ ... }}
  const placeholders = selectAllChildren(document.body)
    .filter(n => n.nodeType === Node.TEXT_NODE && n.textContent.match !== undefined)
    .map(n => ({ n, match: n.textContent.match(/{{([^}]+)}}/) }))
    .filter(entry => entry.match !== null);
  // Replace them with the content of partial
  for (const entry of placeholders) {
    // Compile the filename
    const placeHolderName = entry.match[1].trim();
    const article = new URLSearchParams(window.location.toString().split('?')[1]).get(placeHolderName);
    const file = article !== null ? article : placeHolderName;
    // Retrieve the content
    const result = await fetch(file);
    const content = await result.text();
    // Replace the placeholder by the content
    const div = document.createElement('div');
    div.innerHTML = content;
    // Some content will contain text nodes.
    const contentNode = Array.from(div.childNodes).filter(n => n.nodeType !== Node.TEXT_NODE)[0];
    entry.n.replaceWith(contentNode);
  }
}

window.onload = main
