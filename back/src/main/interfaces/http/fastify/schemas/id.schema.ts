import { z } from 'zod/v4'

// Règle de z.cuid() jusqu'à zod 4.1 : les identifiants importés de Draxa (`clgx_…`) portent un souligné que zod 4.6 refuse.
export const cuid = () => z.string().regex(/^[cC][^\s-]{8,}$/, 'Invalid cuid')
