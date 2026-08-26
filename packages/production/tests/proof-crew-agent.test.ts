import { describe, expect, it } from 'vitest';
import { PRODUCTION_SECRET_VARIABLES } from '../src/proof/agent-environment';
import { crewAuthorship, crewProofArguments, crewProofEnvironment } from '../src/proof/crew-agent';

describe('crew proof driver arguments', () => {
  it('points the crew at the work root and names where the bundle goes', () => {
    const args = crewProofArguments({
      workRoot: 'C:\\proof-work',
      plan: 'plan.json',
      evidence: 'evidence',
    });

    expect(args).toEqual([
      '-m',
      'vox_crew',
      '--work-root',
      'C:\\proof-work',
      '--evidence',
      'evidence',
      '--plan',
      'plan.json',
    ]);
  });

  it('omits the handed plan when the crew is to author one for itself', () => {
    const args = crewProofArguments({ workRoot: 'C:\\proof-work', evidence: 'evidence' });

    expect(args).not.toContain('--plan');
    expect(args).toContain('--work-root');
  });

  /**
   * A showcase run wants a stronger model than the crew's default without that default
   * moving: the pin is what lets a bundle name the model that authored a plan, and an alias
   * or a shifting default could not. So the choice travels with the invocation.
   */
  it('carries a chosen model to the author, and asks for none when none is chosen', () => {
    expect(
      crewProofArguments({
        workRoot: 'C:\\proof-work',
        evidence: 'evidence',
        model: 'gemini-3.6-pro',
      }),
    ).toEqual([
      '-m',
      'vox_crew',
      '--work-root',
      'C:\\proof-work',
      '--evidence',
      'evidence',
      '--model',
      'gemini-3.6-pro',
    ]);
    expect(crewProofArguments({ workRoot: 'C:\\proof-work', evidence: 'evidence' })).not.toContain(
      '--model',
    );
  });
});

describe('crew proof driver environment', () => {
  const source = {
    PATH: 'C:\\Windows\\System32',
    ELEVENLABS_API_KEY: 'production-secret',
    VOX_GRANT_KEY: 'production-secret-two',
    GOOGLE_API_KEY: 'the-crew-model-key',
    HOME: 'C:\\Users\\somebody',
  };
  const launcherEnvironment = { VOX_PIPE_NAME: 'vox-proof-1', VOX_IPC_TOKEN: 'token' };

  it('keeps the launcher capability the crew is meant to hold', () => {
    const environment = crewProofEnvironment(source, launcherEnvironment, 'C:\\proof-work');

    expect(environment.VOX_PIPE_NAME).toBe('vox-proof-1');
    expect(environment.VOX_IPC_TOKEN).toBe('token');
  });

  it('carries the model credential and no production secret', () => {
    const environment = crewProofEnvironment(source, launcherEnvironment, 'C:\\proof-work');

    // Review decision 2: the scrub's escape hatch exists so the crew can reach its model at
    // all. What it does not admit is anything on the production side of ADR-0007.
    expect(environment.GOOGLE_API_KEY).toBe('the-crew-model-key');
    for (const name of PRODUCTION_SECRET_VARIABLES) {
      expect(environment[name]).toBeUndefined();
    }
  });

  it('confines the crew to the work root for temporary files', () => {
    const environment = crewProofEnvironment(source, launcherEnvironment, 'C:\\proof-work');

    expect(environment.TEMP).toBe('C:\\proof-work');
    expect(environment.TMP).toBe('C:\\proof-work');
  });
});

describe('what a crew run may claim about its authorship', () => {
  it('is a fresh generalist only when the crew authored the plan itself', () => {
    expect(crewAuthorship(undefined)).toEqual({
      authorship: 'fresh-generalist',
      unscripted: true,
    });
  });

  it('is scripted when a plan was handed in, whatever else the crew did', () => {
    // Everything but the model is still the crew's: discovery, the review, the convergence,
    // the producer, the read-back and the bundle. None of that makes the plan unscripted, and
    // a driver that claimed otherwise would put the claim into `environment.json`.
    expect(crewAuthorship({ beats: [] })).toEqual({
      authorship: 'fixture-scripted',
      unscripted: false,
    });
  });
});
