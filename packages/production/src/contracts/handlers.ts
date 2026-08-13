import catalog from './generated/catalog.json';
import checks from './generated/checks.json';
import index from './generated/index.json';
import language from './generated/language.json';
import plan from './generated/plan.json';
import protocol from './generated/protocol.json';
import {
  type ContractCategory,
  PROTOCOL_VERSION,
  type ResultEnvelope,
  resultEnvelopeSchema,
} from './schemas';

const categories: Record<ContractCategory, Record<string, unknown>> = {
  language,
  plan,
  catalog,
  checks,
  protocol,
};

const envelope = (value: ResultEnvelope): ResultEnvelope => resultEnvelopeSchema.parse(value);

export const handleContractIndex = (): ResultEnvelope =>
  envelope({
    protocolVersion: PROTOCOL_VERSION,
    command: 'contract.index',
    outcome: 'succeeded',
    run: null,
    data: { categories: index.categories },
    artifacts: [],
    error: null,
    next: [],
  });

export const handleContractShow = (category: ContractCategory): ResultEnvelope =>
  envelope({
    protocolVersion: PROTOCOL_VERSION,
    command: 'contract.show',
    outcome: 'succeeded',
    run: null,
    data: categories[category],
    artifacts: [],
    error: null,
    next: [],
  });
