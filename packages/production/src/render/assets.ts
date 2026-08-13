import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { CompiledDocument } from '@vox/video';
import type { AssetResolution } from '../run-store/run-store';

export const assetResolutionView = (document: CompiledDocument): AssetResolution[] => {
  const resolutions: AssetResolution[] = [];
  for (const section of document.sections) {
    for (const scene of section.scenes) {
      for (const [field, ref] of Object.entries(scene.assets)) {
        if (!ref) continue;
        resolutions.push(resolution(section.id, scene.id, `props.${field}`, ref));
      }
    }
    for (const element of section.persistent) {
      if (!element.asset) continue;
      resolutions.push(
        resolution(section.id, null, `persistent[${element.id}].assetRequirement`, element.asset),
      );
    }
  }
  return resolutions;
};

const resolution = (
  sectionId: string,
  sceneId: string | null,
  field: string,
  ref:
    | { status: 'ready'; uri: string }
    | { status: 'placeholder'; uri: string; pendingRequirementId: string }
    | { status: 'failed'; uri: string; requirementId: string; reason: string },
): AssetResolution => ({
  sectionId,
  sceneId,
  field,
  status: ref.status,
  uri: ref.uri,
  pendingRequirementId: ref.status === 'placeholder' ? ref.pendingRequirementId : null,
  requirementId: ref.status === 'failed' ? ref.requirementId : null,
  reason: ref.status === 'failed' ? ref.reason : null,
});

export const verifyServiceReadableAssets = async (view: AssetResolution[]): Promise<void> => {
  for (const asset of view) {
    // Placeholder and failed scene assets render as an editorial plate; their URI is
    // operational metadata, not a resource the renderer opens.
    if (asset.status !== 'ready') continue;
    if (!asset.uri) throw new Error(`ASSET_NOT_SERVICE_READABLE:${asset.field}`);
    if (asset.uri.startsWith('data:')) {
      if (!asset.uri.includes(',') || asset.uri.slice(asset.uri.indexOf(',') + 1).length === 0) {
        throw new Error(`ASSET_NOT_SERVICE_READABLE:${asset.field}`);
      }
      continue;
    }
    if (asset.uri.startsWith('file:')) {
      await access(fileURLToPath(asset.uri));
      continue;
    }
    throw new Error(`ASSET_NOT_SERVICE_READABLE:${asset.field}`);
  }
};
