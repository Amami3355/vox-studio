"""Operator diagnostic: retain public grounding evidence before contract validation.

Runs the installed hosted entry point unchanged; never retains requests or thought parts.
"""
import asyncio
import copy
import json
import os
import sys
from pathlib import Path

import importlib.util
import vox_crew
role_patch = Path('/etc/vox-crew/adk_roles.py')
if role_patch.exists():
    spec = importlib.util.spec_from_file_location('vox_crew.adk_roles', role_patch)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    vox_crew.adk_roles = module

from vox_crew import adk_roles, grounded_research, hosted, provider_usage

original = grounded_research.grounded_dossier
original_ask = adk_roles.AdkJsonRole.ask
original_agent = adk_roles.AdkJsonRole.agent
model_lock = asyncio.Lock()


async def serialized_ask(self, *args, **kwargs):
    # The deployed journal refuses a second outstanding dispatch. Preserve that rule
    # while the creative workflow schedules independent roles concurrently.
    async with model_lock:
        return await original_ask(self, *args, **kwargs)


def captured_agent(self, *args, **kwargs):
    agent = original_agent(self, *args, **kwargs)
    after = agent.after_model_callback

    def captured_after(callback_context, llm_response):
        after(callback_context, llm_response)
        journal = provider_usage.CURRENT.get()
        dispatch = next(row for row in reversed(journal.records) if row['status'] == 'dispatched')
        parts = getattr(llm_response.content, 'parts', None) or []
        public = {'role': self.name, 'dispatchId': dispatch['id'],
                  'text': ''.join(part.text for part in parts if part.text and not part.thought),
                  'partKinds': [{'text': bool(part.text), 'thought': bool(part.thought),
                                 'functionCall': bool(part.function_call)} for part in parts]}
        serialized = json.dumps(public)
        if any(os.environ.get(name) and os.environ[name] in serialized
               for name in ('PARALLEL_API_KEY', 'VOX_NETWORK_TOKEN')):
            raise ValueError('Credential material in model response; capture refused.')
        hosted.write_json(journal.path.parent / 'model-responses' / (dispatch['id'] + '.json'), public)

    agent.after_model_callback = captured_after
    return agent


def capture_grounding(body):
    journal = provider_usage.CURRENT.get()
    dispatch = next(row for row in reversed(journal.records) if row['status'] == 'dispatched')
    public = {'model_version': body.get('model_version'), 'candidates': []}
    for candidate in body.get('candidates', []):
        parts = []
        for part in candidate.get('content', {}).get('parts', []):
            parts.append({'thought': True} if part.get('thought') else {'text': part.get('text', '')})
        public['candidates'].append({
            'content': {'parts': parts},
            'grounding_metadata': copy.deepcopy(candidate.get('grounding_metadata', {})),
            'finish_reason': candidate.get('finish_reason'),
        })
    # Refuse accidental credential material instead of modifying citation byte coordinates.
    serialized = json.dumps(public)
    if any(os.environ.get(name) and os.environ[name] in serialized
           for name in ('PARALLEL_API_KEY', 'VOX_NETWORK_TOKEN')):
        raise ValueError('Credential material in provider response; capture refused.')
    path = journal.path.parent / 'grounding-responses' / (dispatch['id'] + '.json')
    hosted.write_json(path, public)
    try:
        return original(body)
    except Exception as error:
        message = str(error)
        for name in ('PARALLEL_API_KEY', 'VOX_NETWORK_TOKEN'):
            if os.environ.get(name):
                message = message.replace(os.environ[name], '<redacted>')
        hosted.write_json(path.with_suffix('.validation.json'), {
            'errorType': type(error).__name__, 'message': message,
        })
        raise


grounded_research.grounded_dossier = capture_grounding
adk_roles.AdkJsonRole.ask = serialized_ask
adk_roles.AdkJsonRole.agent = captured_agent
raise SystemExit(hosted.main())
