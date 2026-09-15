import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {fileURLToPath} from "node:url";
import {checkSource} from "./source.mjs";
const root = fileURLToPath(new URL("../../", import.meta.url));
const hash = value => crypto.createHash("sha256").update(value).digest("hex").toUpperCase();
const escape = value => value.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll('"',"&quot;");
export function validateRecipe(recipe, source) {
  if (recipe?.schemaVersion !== 1 || recipe.sourceSha256 !== source.sha256
    || recipe.method !== "SVG_VIEWPORT_OF_UNMODIFIED_EMBEDDED_RASTER"
    || recipe.trueVector !== false || recipe.transparent !== false) throw new Error("Invalid brand recipe/source");
  if (!Array.isArray(recipe.variants) || recipe.variants.length !== 3) throw new Error("Expected three source compositions");
  const ids = new Set();
  for (const variant of recipe.variants) {
    if (!/^[a-z]+(?:-[a-z]+)+$/u.test(variant.id) || ids.has(variant.id)
      || typeof variant.label !== "string" || !variant.label.length) throw new Error("Invalid variant identity");
    ids.add(variant.id);
    if (!Array.isArray(variant.rect) || variant.rect.length !== 4
      || !variant.rect.every(Number.isSafeInteger)) throw new Error("Invalid source viewport");
    const [x,y,w,h] = variant.rect;
    if (x < 0 || y < 0 || w < 1 || h < 1 || x+w > source.width || y+h > source.height) {
      throw new Error("Viewport outside approved source");
    }
  }
  return recipe;
}
export function svgFor(source, bytes, rect, title) {
  if (hash(bytes) !== source.sha256) throw new Error("Source changed before embedding");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${rect[2]}" height="${rect[3]}" viewBox="${rect.join(" ")}" role="img" aria-label="${escape(title)}">\n<title>${escape(title)}</title>\n<image x="0" y="0" width="${source.width}" height="${source.height}" href="data:image/png;base64,${bytes.toString("base64")}"/>\n</svg>\n`;
}
export function createVariants(recipe, source, bytes) {
  validateRecipe(recipe, source);
  const files = new Map();
  files.set("master-raster-backed.svg",svgFor(source,bytes,[0,0,source.width,source.height],"Prancha original Spynon — master com raster incorporado"));
  for (const variant of recipe.variants) files.set(`${variant.id}.svg`,svgFor(source,bytes,variant.rect,variant.label));
  const cards = recipe.variants.map(variant => `<article><h2>${escape(variant.label)}</h2><div class="pair"><div class="dark"><img src="${variant.id}.svg" alt="${escape(variant.label)} em contexto escuro"></div><div class="light"><img src="${variant.id}.svg" alt="${escape(variant.label)} em contexto claro"></div></div><p>Viewport ${variant.rect.join(" · ")} — pixels do original; proporção preservada.</p></article>`).join("\n");
  files.set("review.html",`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Spynon — comparação técnica da marca</title><style>body{margin:0;background:#09101c;color:#edf3fa;font:16px system-ui}main{max-width:1080px;margin:auto;padding:32px}h1{font-size:28px}h2{font-size:18px;margin-top:0}p{color:#9cacc1;line-height:1.6}article{border:1px solid #27384d;border-radius:10px;padding:20px;margin:24px 0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}.pair>div{height:200px;display:flex;align-items:center;justify-content:center;padding:16px;border-radius:6px}.dark{background:#040910}.light{background:#edf1f5}.pair img{max-width:100%;max-height:190px;object-fit:contain}a{color:#95d7ff}details img{max-width:100%}@media(max-width:650px){.pair{grid-template-columns:1fr}main{padding:16px}}</style><main><h1>Spynon · derivados técnicos</h1><p>Mesma arte aprovada, sem redesenho. Os SVGs incorporam o PNG original: são contêineres escaláveis, não vetores reconstruídos nem recortes transparentes.</p><p>A superfície galáxia foi preservada inclusive sobre contexto claro. Não houve inversão de cor, substituição de tipografia ou reconstrução de contorno.</p>${cards}<details><summary>Comparar com a prancha original completa</summary><img src="master-raster-backed.svg" alt="Prancha original aprovada"></details><p>Fidelidade técnica não significa aprovação do uso no HUD. Próxima etapa: aplicação discreta e revisão visual.</p></main></html>\n`);
  const manifest = {schemaVersion:1,sourceSha256:source.sha256,recipeSha256:hash(JSON.stringify(recipe)),
    method:recipe.method,trueVector:false,transparent:false,
    files:[...files].map(([name,value]) => ({name,bytes:Buffer.byteLength(value),sha256:hash(value)}))};
  files.set("manifest.json",JSON.stringify(manifest,null,2)+"\n");
  return files;
}
export function run(mode = "check") {
  if (mode !== "check" && mode !== "build") throw new Error("Use check or build");
  const source = checkSource(root), recipe = JSON.parse(fs.readFileSync(path.join(root,"assets/brand/variants.json"),"utf8"));
  const bytes = fs.readFileSync(path.join(root,"assets/brand/Spynon Logo.png"));
  const outputs = createVariants(recipe,source,bytes), directory = path.join(root,"assets/brand/technical");
  if (mode === "build") fs.mkdirSync(directory,{recursive:true});
  for (const [name,value] of outputs) {
    const target = path.join(directory,name);
    if (fs.existsSync(target) && !fs.lstatSync(target).isFile()) throw new Error(`Invalid output: ${name}`);
    if (mode === "build") fs.writeFileSync(target,value);
    else if (!fs.existsSync(target) || fs.readFileSync(target,"utf8") !== value) throw new Error(`Brand derivative drift: ${name}`);
  }
  console.log(`Brand derivatives ${mode}: ${outputs.size} reproducible files; original unchanged.`);
  return outputs;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run(process.argv[2]);
