// Coach replies: just enough markdown for a chat bubble. No DOM, so it's testable.
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Just enough markdown for chat: paragraphs, **bold**, and - / 1. lists.
export function md(text) {
  const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(^|[\s(])\*(?!\s)(.+?)\*(?=[\s).,!?]|$)/g, "$1<i>$2</i>");
  const out = [];
  let list = null;
  const close = () => { if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li>${i}</li>`).join("")}</${list.tag}>`); list = null; } };
  let para = [];
  const flush = () => { if (para.length) { out.push(`<p>${para.join("<br>")}</p>`); para = []; } };
  for (const raw of String(text ?? "").split("\n")) {
    const line = raw.trim();
    const ul = line.match(/^[-*•]\s+(.*)$/), ol = line.match(/^\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      flush();
      const tag = ul ? "ul" : "ol";
      if (list && list.tag !== tag) close();
      if (!list) list = { tag, items: [] };
      list.items.push(inline((ul ?? ol)[1]));
    } else if (!line) { flush(); close(); }
    else { close(); para.push(inline(line.replace(/^#+\s*/, ""))); }
  }
  flush(); close();
  return out.join("");
}

