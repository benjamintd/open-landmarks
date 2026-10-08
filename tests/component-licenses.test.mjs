import test from 'node:test';
import assert from 'node:assert/strict';
import { componentLicenseErrors } from '../tools/component-licenses.mjs';

const original = { artisticLicense:'CC-BY-4.0', spatialDataLicense:'ODbL-1.0', licenseScope:'Original art and OSM spatial data have distinct licenses.' };
const source = { title:'EiffelTower fixed.stl', author:'Newcandle',
  sourcePage:'https://commons.wikimedia.org/wiki/File:EiffelTower_fixed.stl',
  originalFileUrl:'https://upload.wikimedia.org/wikipedia/commons/4/41/EiffelTower_fixed.stl',
  sha256:'bff2ce1d08609b2d761a225cb7c8c1da782369714011567ede7a5008a1e55adf',
  license:'CC-BY-SA-3.0', licenseUrl:'https://creativecommons.org/licenses/by-sa/3.0/',
  modifications:'Rescaled, georeferenced and simplified for map rendering.' };

test('original contributions retain the existing license contract', () => {
  assert.deepEqual(componentLicenseErrors(original), []);
});
test('an imported share-alike model keeps its license and complete provenance', () => {
  assert.deepEqual(componentLicenseErrors({...original, artisticLicense:'CC-BY-SA-3.0', modelSources:[source]}), []);
  assert(componentLicenseErrors({...original, modelSources:[source]}).includes('retain the source model share-alike license'));
});
test('imports reject non-free grants and incomplete source evidence', () => {
  assert(componentLicenseErrors({...original, artisticLicense:'CC-BY-NC-4.0'}).length);
  assert(componentLicenseErrors({...original, artisticLicense:'CC-BY-SA-3.0'}).length);
  assert(componentLicenseErrors({...original, modelSources:[{...source,license:'CC-BY-NC-4.0',licenseUrl:undefined}]}).length);
  assert(componentLicenseErrors({...original,modelSources:[null]}).length);
  assert(componentLicenseErrors({...original,wikidata:'way/123'}).length);
  assert(componentLicenseErrors({...original,artisticLicense:'toString',modelSources:[source]}).length);
  assert(componentLicenseErrors({...original,artisticLicense:'CC0-1.0',modelSources:[{...source,license:'CC-BY-4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/'}]}).length);
  for (const field of ['author','sourcePage','originalFileUrl','sha256','licenseUrl','modifications']) {
    const missing = {...source}; delete missing[field];
    assert(componentLicenseErrors({...original, artisticLicense:'CC-BY-SA-3.0', modelSources:[missing]}).length, field);
  }
});
