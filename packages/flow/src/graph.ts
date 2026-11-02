/**
 * @module @covora/flow/graph
 *
 * Bir blueprint grafının kalıcı şeması: node'lar (tür + konum + parametreler) ve
 * kenarlar (kaynak çıkış portu → hedef giriş portu). zod ile doğrulanır; DB'de
 * `BlueprintVersion.graph` olarak JSON saklanır.
 */

import { z } from 'zod'

export const flowNodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  position: z.object({ x: z.number(), y: z.number() }),
  params: z.record(z.string(), z.unknown()).default({})
})

export const flowEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  /** Kaynak node'un çıkış portu adı. */
  sourceHandle: z.string().min(1),
  target: z.string().min(1),
  /** Hedef node'un giriş portu adı. */
  targetHandle: z.string().min(1)
})

export const flowGraphSchema = z.object({
  nodes: z.array(flowNodeSchema).default([]),
  edges: z.array(flowEdgeSchema).default([])
})

export type FlowNode = z.infer<typeof flowNodeSchema>
export type FlowEdge = z.infer<typeof flowEdgeSchema>
export type FlowGraph = z.infer<typeof flowGraphSchema>

/** Ham veriyi doğrulayıp normalize eder (varsayılanları doldurur). */
export const parseGraph = (raw: unknown): FlowGraph => flowGraphSchema.parse(raw)
