// Optional local static proof. Does not open HTML, launch a browser, or access the network.
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {run} from "./variants.mjs";
const root = fileURLToPath(new URL("../../",import.meta.url));
const dependencyRoot = process.argv[2];
if (!dependencyRoot || !path.isAbsolute(dependencyRoot)) throw new Error("Provide an installed trusted Node package directory");
const require = createRequire(path.join(dependencyRoot,"brand-preview.cjs"));
const sharp = require("sharp");
const files = run("check"); // Reject edited SVGs; only our static, embedded-source markup is rendered.
const recipe = JSON.parse(fs.readFileSync(path.join(root,"assets/brand/variants.json"),"utf8"));
const directory = path.join(root,"dist/brand-review");
fs.mkdirSync(directory,{recursive:true});
const layers = [];
for (let row=0; row<recipe.variants.length; row++) {
  const variant = recipe.variants[row];
  const png = await sharp(Buffer.from(files.get(`${variant.id}.svg`)))
    .resize({width:520,height:230,fit:"inside",withoutEnlargement:true}).png().toBuffer();
  const {width,height} = await sharp(png).metadata();
  for (let column=0; column<2; column++) {
    const panel = await sharp({create:{width:560,height:250,channels:4,
      background:column===0?"#030810":"#edf1f5"}}).png().toBuffer();
    layers.push({input:panel,left:24+column*584,top:60+row*290});
    layers.push({input:png,left:24+column*584+Math.floor((560-width)/2),
      top:60+row*290+Math.floor((250-height)/2)});
  }
  fs.writeFileSync(path.join(directory,`${variant.id}.png`),png);
}
const headings = `<svg xmlns="http://www.w3.org/2000/svg" width="1192" height="940"><g fill="#edf3fa" font-family="sans-serif" font-size="18"><text x="24" y="30">Spynon · original preservado · contexto escuro</text><text x="608" y="30">Mesmo derivado · contexto claro</text>${recipe.variants.map((variant,index)=>`<text x="24" y="${335+index*290}">${variant.label}</text>`).join("")}</g></svg>`;
layers.push({input:Buffer.from(headings),left:0,top:0});
const output = path.join(directory,"comparison.png");
await sharp({create:{width:1192,height:940,channels:4,background:"#09101c"}}).composite(layers).png().toFile(output);
console.log(JSON.stringify({output,renderer:sharp.versions,scope:"STATIC_SVG_ONLY_NOT_BROWSER_OR_RETAIL"},null,2));
