# Materials and attached windows

[`materials.json`](../materials.json) is the versioned, texture-free material
library used by the Blender authoring tools, submission validator and Clair SDK.
Colors are sRGB hex values; Blender and glTF store their linear RGB equivalents.
The library also defines roughness and metalness. Unlisted names, colors, surface
properties, image textures, transparency and material extensions fail validation.

- `window`: light blue `#a4c4d9`, for vertical panels attached to walls.
- `glass`: the same light blue with smoother reflective properties, for structural
  glazing such as dome roofs, pyramids and observation-room enclosures.
- `stone`, `trim`, `roof`, `recess`, `metal`: the standard architectural swatches.
- `copper`, `patina`: approved weathered metal variants.
- `stone` uses Clair's light 3D building color (`#efe4d3`); `trim` and `roof`
  echo its paving and cool infrastructure colors. This keeps ordinary Paris
  masonry close to the surrounding extrusions without erasing silhouettes.
- `pompidou-red`, `pompidou-blue`, `pompidou-green`, `pompidou-yellow` and `terracotta` are
  landmark-specific opaque finishes. They preserve distinctive structures
  where the general stone palette would misrepresent the architecture.
- `eiffel-iron-dark` and `eiffel-iron-light` flank the standard warm metal
  swatch for a restrained base-to-summit iron gradient.

Use `recess` for dark stone or clock hands, not window glazing. A model still has
at most six materials and six triangle draw calls, even though the library offers
more choices. Image textures are currently an empty allowlist.

The limits protect map performance, but they are not a request to remove a
building's defining features. A new color or finish can be added to this shared
library with a source-backed modeling note and reviewed on the rendered asset.
Use the budget for specific structure, openings and roof forms before repeating
generic facade decoration.

## Attachment contract

The exported `window` triangles must be vertical and their complete area must
project onto actual, parallel supporting wall triangles within **0.06 metres**.
Supporting roles are listed in `windowSupportMaterials` in the shared library;
the builder and exported GLB audit read the same list. Windows
cannot support other windows. The audit subtracts wall triangles from the window
area, so corners, gaps, through-passages and eaves are checked, including apertures
that sparse ray samples would miss. A tiny area tolerance handles float32 noise.
The check runs independently for both LODs after glTF structural validation.

The authoring `wall_bays` primitive fits panels within straight wall segments,
including courtyard rings and short circular facets. `part_windows` uses the
modeled part's bottom/eave elevations. Before export, `attach_windows` clips
proposed decorative panels to real wall faces and records proposed, clipped and
omitted counts in `metrics.json`. Review large omission counts: they often mean
that a recipe is using an outline different from the wall it constructed.
LOD simplification preserves wall planes; it must not detach facade decoration.

## Consumer integration

New catalogue descriptors include a `materialLibrary` object containing its
schema version, SHA-256 and immutable URL. Collection bounds are derived from all
members, including landmarks outside central Paris. Validation-report changes
receive new publication revisions; retained release files are never overwritten.

The workshop's `npm run test:clair` verifies every imported SDK source hash and
runs Clair's consumer tests. Its contract test reads the actual locally built
public preview catalogue, discovers every member through the imported SDK and
checks palette, coordinate and early-discovery behavior. Build the public project
before running this test. Regenerate a stale Clair snapshot with:

```sh
node ../clair/packages/clair-3d/scripts/import-open-landmarks.mjs .
```

This updates the local development SDK. It does not publish a Clair release.
