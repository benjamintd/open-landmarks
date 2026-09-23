# Contributing a landmark

Use Blender by hand, procedural tools, or AI assistance. None is mandatory. AI was used to interpret references and author the initial recipes; running those recipes then exported the geometry deterministically. Contributors do not need that private workflow.

1. Create `collection/<stable-id>/` with `asset.json` based on `templates/asset.json`. Use a descriptive, unique kebab-case ID.
2. Provide `detail.glb` and `low.glb`, and `source.blend.gz` (gzip-compressed editable Blender scene). Only export the building, not preview cameras, lights or ground. Preserve the editable scene; disclose any source dependencies. Do not embed executable scripts, credentials, reference photographs or private paths in the scene.
3. Provide `spatial-source.json` with the OSM footprint and parts actually used, IDs, versions and timestamp. Existing submissions show the local metres format and anchor. Declare any manual corrections and measurements rather than quietly replacing source geometry. The complete derived spatial data must remain available.
4. Provide `preview.webp`, ideally <=40 kB, with a neutral studio view. Record reference source pages, authors, licenses and use. No copied commercial-map geometry or screenshots. Avoid photo textures in v1.
5. Fill both GLB byte counts and full SHA-256 hashes. On macOS/Linux: `wc -c detail.glb` and `shasum -a 256 detail.glb`.
6. Run `npm ci`, `npm run validate`, `npm test` and `npm run build`. Fix structural errors. Submit a pull request containing the source files and metadata. Do not include generated `releases/` changes; publication is prepared separately.

## Model contract

- Ground at Y=0. WGS84 anchor `[longitude, latitude]`; metres, X east / Y up / Z south in the GLB. Heading is baked. Apply all object transforms and flatten exported nodes for the v1 validator.
- `boundsBlenderM` is an axis-aligned envelope in X east / Y north / Z up. Both LODs must fit inside it.
- <=8,000 triangles, <=250,000 raw bytes per GLB, <=6 opaque materials and triangle primitives/draw calls. No textures, animations, skins or required decoder extensions. Export real normals.
- Semantic materials come from `materials.json`; use the subset needed. Start with the Clair stone and roof tones, then use approved landmark-specific finishes where color is part of the building's identity. Prioritize silhouette, roof lines, structural rhythm and major openings. `window` panels remain opaque and may carry a small emission; structural glazing uses `glass`.
- Remove hidden wall caps when a roof closes the volume. Coplanar wall/roof surfaces can create black patches even when material values and face normals are valid. Inspect a neutral oblique view and a second side or top view; roof regression tests compare exported surfaces in both LODs.
- A lower LOD should reduce geometry where this preserves recognizable architecture. Do not conceal a higher download cost behind compressed-size marketing alone.

## Review and promotion

Keep `rightsStatus: review-required`, `geometryStatus: draft` and `review.status: pending` on submission. `npm run validate` reports a content revision. After inspection, a maintainer sets:

```json
{
  "rightsStatus": "approved",
  "geometryStatus": "approved",
  "review": {
    "status": "approved",
    "revision": "FULL_CONTENT_REVISION_FROM_VALIDATOR",
    "reviewer": "Named human reviewer",
    "checks": { "rights": "passed", "footprint": "passed", "appearance": "passed", "mapIntegration": "passed" }
  }
}
```

Attach observations/evidence in `review.notes` or additional review files. The reviewer must check source rights, footprint/part fit, height and orientation, architectural recognizability, normals and overlaps from multiple angles, day/night lightness, basemap replacement and tall-building culling. Automated duplicate-face/non-manifold counts are signals, not automatic rejection: thin opaque window panels may intentionally be open. Structural validation does not establish architectural or legal correctness.

Any content change invalidates the approval hash. A public metadata publication has a separate hash that also changes when its review changes. `/api/v1/latest.json` includes approved exact revisions; `/api/v1/preview.json`
includes current drafts. A replacement draft leaves the last approved model in
place until the replacement is approved. Removing its submission does not withdraw
an approved model: add `{ "id": "landmark-id", "reason": "Reason for withdrawal" }`
to `publication-policy.json` under `withdrawn` to remove it from new publications.

The scheduled/manual publication workflow prepares a batch PR after review. Its
merge advances production. Ordinary contribution PRs need no snapshot and do not
advance the production dataset. Vercel Preview shows candidate data. Never rewrite
retained global publication files. All landmarks belong to one global catalogue;
no city or collection registration is needed.

## Contributor grant

By submitting content, offer your original artistic contributions under CC BY 4.0, your original code under MIT, and OSM-derived spatial data under ODbL 1.0. Identify third-party inputs and any limitations on rights you can grant. Provide editable sources and applicable source data. This does not require releasing your private generation tools or buying any AI product. Maintainers must resolve incompatible or uncertain rights before approval.

Facade windows must use the approved light blue `window` material and pass whole-area
wall-support validation in both LODs. Structural glazing uses `glass`. See the
[material library and attachment contract](docs/MATERIALS.md).
