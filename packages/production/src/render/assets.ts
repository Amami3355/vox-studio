import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { CompiledDocument } from '@vox/video';
import { sha256Bytes } from '../canonical-json';
import type { ArtifactDescriptor, ImageJob } from '../contracts/schemas';
import type { AssetResolution } from '../run-store/run-store';

export const imageArtifactUri = (sha256: string): string => {
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error('IMAGE_DIGEST_INVALID');
  return `vox-asset:sha256:${sha256}`;
};

/** Resolve only at the renderer boundary. The persisted document remains compact.
 * Historical inline/file assets retain their existing read path and signed identity.
 */
export const materializeImageArtifacts = async (
  document: CompiledDocument,
  jobs: ImageJob[],
  read: (descriptor: ArtifactDescriptor) => Promise<Uint8Array>,
): Promise<CompiledDocument> => {
  const result = structuredClone(document);
  const candidates = new Map(
    jobs
      .filter((job) => job.status === 'accepted' && job.candidate)
      .map((job) => [imageArtifactUri(job.candidate!.artifact.sha256), job.candidate!.artifact]),
  );
  const resolved = new Map<string, string>();
  const materialize = async (ref: { status: string; uri: string } | undefined) => {
    if (ref?.status !== 'ready' || !ref.uri.startsWith('vox-asset:')) return;
    const descriptor = candidates.get(ref.uri);
    if (!descriptor) throw new Error('IMAGE_ARTIFACT_NOT_ACCEPTED');
    let uri = resolved.get(ref.uri);
    if (!uri) {
      const bytes = await read(descriptor);
      if (sha256Bytes(bytes) !== descriptor.sha256) throw new Error('IMAGE_ARTIFACT_CORRUPTED');
      uri = `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
      resolved.set(ref.uri, uri);
    }
    ref.uri = uri;
  };
  for (const section of result.sections) {
    for (const scene of section.scenes) {
      for (const ref of Object.values(scene.assets)) await materialize(ref);
    }
    for (const element of section.persistent) await materialize(element.asset);
  }
  return result;
};

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
