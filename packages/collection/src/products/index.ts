import { epyc9965 } from './epyc-9965';
import { epyc9996Venice } from './epyc-9996-venice';
import { micron512gbRdimm } from './micron-512gb-rdimm';
import { rtxPro6000Blackwell } from './rtx-pro-6000-blackwell';

/** Порядок совпадает со сценами главной: Venice → 9965 → память → GPU. */
export const products = [epyc9996Venice, epyc9965, micron512gbRdimm, rtxPro6000Blackwell];

export { epyc9965, epyc9996Venice, micron512gbRdimm, rtxPro6000Blackwell };
