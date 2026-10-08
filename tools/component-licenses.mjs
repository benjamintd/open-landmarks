// Imported artistic works retain their own grants; spatial data remains ODbL.
export const artisticLicenses = {
  'CC-BY-4.0': 'https://creativecommons.org/licenses/by/4.0/',
  'CC-BY-SA-3.0': 'https://creativecommons.org/licenses/by-sa/3.0/',
  'CC-BY-SA-4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
  'CC0-1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',
};
const text = value => typeof value === 'string' && value.trim();
const supported = value => typeof value === 'string' && Object.hasOwn(artisticLicenses,value);

export function componentLicenseErrors(asset) {
  const errors = [];
  if (asset.wikidata !== undefined && (typeof asset.wikidata !== 'string' || !/^Q[1-9][0-9]*$/.test(asset.wikidata))) errors.push('invalid Wikidata entity ID');
  if (!supported(asset.artisticLicense) || asset.spatialDataLicense !== 'ODbL-1.0' || !text(asset.licenseScope)) {
    errors.push('component licenses required');
  }
  const sources = asset.modelSources ?? [];
  if (!Array.isArray(sources)) return [...errors, 'modelSources must be an array'];
  if (asset.artisticLicense !== 'CC-BY-4.0' && !sources.length) errors.push('non-default artistic license requires model source provenance');
  for (const source of sources) {
    if (!source || typeof source !== 'object') { errors.push('model source provenance incomplete'); continue; }
    if (!text(source.title) || !text(source.author) ||
        !/^https:\/\//.test(source.sourcePage ?? '') ||
        !/^https:\/\//.test(source.originalFileUrl ?? '') ||
        !/^[a-f0-9]{64}$/.test(source.sha256 ?? '') ||
        !text(source.modifications) || !supported(source.license) ||
        source.licenseUrl !== artisticLicenses[source.license]) errors.push('model source provenance incomplete');
    if (typeof source.license === 'string' && source.license.startsWith('CC-BY-SA-') && source.license !== asset.artisticLicense) {
      errors.push('retain the source model share-alike license');
    }
    if (source.license === 'CC-BY-4.0' && !['CC-BY-4.0','CC-BY-SA-4.0'].includes(asset.artisticLicense)) errors.push('retain the source model attribution license');
  }
  return errors;
}
