import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {checkSource} from "../../tools/brand/source.mjs";
import {validateRecipe,createVariants} from "../../tools/brand/variants.mjs";
const recipe = JSON.parse(fs.readFileSync("assets/brand/variants.json","utf8"));
const source = checkSource(), bytes = fs.readFileSync("assets/brand/Spynon Logo.png");
test("every derivative embeds exactly the approved pixels without tracing or recoloring", () => {
  const outputs = createVariants(recipe,source,bytes);
  for (const [name,svg] of outputs) {
    if (!name.endsWith(".svg")) continue;
    const encoded = /href="data:image\/png;base64,([A-Za-z0-9+/=]+)"/u.exec(svg)?.[1];
    assert.deepEqual(Buffer.from(encoded,"base64"),bytes);
    assert.ok(!/<path|<filter|<script|<foreignObject/u.test(svg));
  }
});
test("technical outputs are deterministic and separately identified as raster-backed", () => {
  const first = createVariants(recipe,source,bytes), second = createVariants(recipe,source,bytes);
  assert.deepEqual(first,second); assert.equal(first.size,6);
  const manifest = JSON.parse(first.get("manifest.json"));
  assert.equal(manifest.trueVector,false); assert.equal(manifest.transparent,false);
});
test("viewports preserve their declared source rectangle and aspect ratio", () => {
  const outputs = createVariants(recipe,source,bytes);
  for (const variant of recipe.variants) {
    const svg = outputs.get(`${variant.id}.svg`);
    assert.ok(svg.includes(`viewBox="${variant.rect.join(" ")}"`));
    assert.ok(svg.includes(`width="${variant.rect[2]}" height="${variant.rect[3]}"`));
  }
});
test("out of bounds, duplicate identities, fractional crop and wrong source are rejected", () => {
  for (const rect of [[-1,0,10,10],[0,0,2000,20],[0,0,10,0],[0,0,2.5,4]]) {
    const altered = structuredClone(recipe); altered.variants[0].rect = rect;
    assert.throws(() => validateRecipe(altered,source),/viewport/iu);
  }
  const altered = structuredClone(recipe); altered.variants[1].id = altered.variants[0].id;
  assert.throws(() => validateRecipe(altered,source),/identity/u);
  assert.throws(() => validateRecipe({...recipe,sourceSha256:"bad"},source),/source/u);
});
test("changed pixels cannot be embedded even with a previously validated recipe", () => {
  const changed = Buffer.from(bytes); changed[100] ^= 1;
  assert.throws(() => createVariants(recipe,source,changed),/Source changed/u);
});
