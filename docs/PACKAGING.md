# Dataset packaging

## Identity and discovery

Open Landmarks is one global dataset. A landmark ID identifies a place independently
of geography, display name, publication and file revision. The existing
`collection/` input folder is simply a submission directory. No city registry,
collection membership or collection-specific publisher is required. Consumers
resolve one global channel and discover nearby landmarks through the spatial index.
The current XYZ implementation still rejects antimeridian-spanning footprints and
polar coordinates; those geometry limits are independent of removing collections.

## Immutable files, revisions and publications

- GLBs are addressed by their own SHA-256, preserving existing /models/ URLs.
- Source scenes, previews and spatial extracts are independently addressed under
  /objects/<sha256>/<filename>. Changing metadata, review or palette cannot change
  the identity of unchanged source/preview bytes.
- Content revision binds the metadata (excluding review fields) and submission
  files. Publication revision also binds review, validation, palette and packaging
  version. Model metadata records its material library, including for retained
  approved revisions from an older palette.
- Global catalogues are immutable snapshots. Approved and preview channel pointers
  select them; an unpublished channel has a null catalogue.
- A draft never replaces the previously approved revision. Withdrawals require an
  ID and reason in publication-policy.json. They remove the landmark from both new
  channels while retaining its old files. Remove the policy entry to permit a
  subsequent publication again.

## Publication records

Version 2 records have a name, hash-pinned parent reference, channel pointers,
and a path-to-SHA-256 map of files introduced by that publication only. Unchanged
files are referenced by the catalogue and earlier records, never re-inventoried in
later records. releases/current.json selects a record by name and SHA-256.
Candidate inventories are ignored build state, not published history.

Named releases cannot be overwritten. Identical automatic publication requests
are no-ops. Objects are copied first, the record is written next, and the current
reference advances last. Commit all three together. Publication records express
intent to publish; Vercel deployment history remains the evidence of deployment.

The one-time global migration removes the old Paris API and its release packages
from the current tree. Earlier revisions remain in Git history. The first global
record inventories the current publication; subsequent records contain additions.

## Workflow and cost

Contributors submit source and metadata through GitHub. A scheduled/manual workflow
prepares release PRs in batches, after validation, with the same visual preview
site as other branches. Production website builds read the selected publication,
not the latest working submissions. This allows independent website deployment
without regenerating model validation or a new data snapshot.

Normal candidate builds hash inputs and reuse validation results for unchanged
submissions. Website builds verify the selected metadata and object availability.
Historical binary verification is a separate weekly/manual audit. Cache entries
are disposable and never establish review approval.

Keeping all files in Git and serving only static Vercel deployments means every
deployment still copies history. Git can deduplicate identical blobs at different
paths, but checkouts and build output contain those paths. Real changed revisions
must be retained. New full indexes and dataset/source JSON are still proportional
to dataset size per publication; batching reduces their frequency, not asymptotic
size. Compact records eliminate the separate cumulative inventory growth.

## Future migration

Keep the global channel/catalogue contract when moving files to object storage.
Use a database for identities, changesets, concurrent edits and review state, while
maps continue to consume CDN exports. Add independently hashed spatial chunks,
checkpoint exports and sequenced diffs when the full-index cost warrants an export
schema change. Preserve old published URLs and source/provenance access. Avoid
making a future geographic extract the authoritative identity of a landmark.
