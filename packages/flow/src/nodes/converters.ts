/**
 * @module @covora/flow/nodes/converters
 *
 * Saf ara ("converter") node'ları — Blueprint'in Break/Get/Cast/Make mantığı.
 * Servis kullanmazlar; yalnızca girişleri+parametreleri alıp çıktı üretirler.
 * Değer-seviyesinde esnekliği bunlar sağlar: bir struct'tan alan ayıkla, tip
 * dönüştür, metne göm, koşula göre dallandır.
 */

import type { NodeTypeDef } from '../node-type.js'
import { T } from '../types.js'

const asString = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v))

/** Sabit değer üretir (kaynak). */
export const literalNode: NodeTypeDef = {
  type: 'literal',
  category: 'Araç',
  label: 'Sabit',
  glyph: '◼',
  description: 'Sabit bir string/number/boolean değeri üretir.',
  inputs: [],
  outputs: [{ name: 'value', label: 'değer', type: T.any }],
  params: [
    { name: 'valueType', label: 'tip', control: 'select', options: ['string', 'number', 'boolean'], default: 'string' },
    { name: 'value', label: 'değer', control: 'text', default: '' }
  ],
  execute: ({ params }) => {
    const raw = asString(params.value)
    const kind = asString(params.valueType) || 'string'
    if (kind === 'number') return { value: Number(raw) }
    if (kind === 'boolean') return { value: raw === 'true' || raw === '1' }
    return { value: raw }
  }
}

/** Bir objeden tek alan ayıklar (Blueprint "Get"). */
export const getNode: NodeTypeDef = {
  type: 'get',
  category: 'Araç',
  label: 'Alan Al',
  glyph: '⊙',
  description: 'Bir objeden belirtilen alanın değerini çeker (örn. coverage.score).',
  inputs: [{ name: 'object', label: 'obje', type: T.any, required: true }],
  outputs: [{ name: 'value', label: 'değer', type: T.any }],
  params: [{ name: 'field', label: 'alan', control: 'text', placeholder: 'score' }],
  execute: ({ inputs, params }) => {
    const field = asString(params.field)
    const obj = inputs.object
    if (obj !== null && typeof obj === 'object' && field in (obj as Record<string, unknown>)) {
      return { value: (obj as Record<string, unknown>)[field] }
    }
    return { value: undefined }
  }
}

/** Değeri hedef ilkel tipe dönüştürür. */
export const castNode: NodeTypeDef = {
  type: 'cast',
  category: 'Araç',
  label: 'Dönüştür',
  glyph: '⇄',
  description: 'Değeri string / number / boolean tipine dönüştürür.',
  inputs: [{ name: 'value', label: 'değer', type: T.any, required: true }],
  outputs: [{ name: 'value', label: 'değer', type: T.any }],
  params: [{ name: 'to', label: 'hedef tip', control: 'select', options: ['string', 'number', 'boolean'], default: 'string' }],
  execute: ({ inputs, params }) => {
    const to = asString(params.to) || 'string'
    const v = inputs.value
    if (to === 'number') return { value: Number(v) }
    if (to === 'boolean') return { value: Boolean(v) && v !== 'false' && v !== 0 }
    return { value: asString(v) }
  }
}

/** Değeri bir metin şablonuna gömer. */
export const formatNode: NodeTypeDef = {
  type: 'format',
  category: 'Araç',
  label: 'Metne Göm',
  glyph: '✎',
  description: 'Şablondaki {value} yerine giriş değerini koyar.',
  inputs: [{ name: 'value', label: 'değer', type: T.any, required: true }],
  outputs: [{ name: 'text', label: 'metin', type: T.string }],
  params: [{ name: 'template', label: 'şablon', control: 'text', default: '{value}' }],
  execute: ({ inputs, params }) => {
    const template = asString(params.template) || '{value}'
    return { text: template.replaceAll('{value}', asString(inputs.value)) }
  }
}

/** Koşula göre değeri iki çıkıştan birine yönlendirir. */
export const branchNode: NodeTypeDef = {
  type: 'branch',
  category: 'Araç',
  label: 'Dallan',
  glyph: '⋔',
  description: 'cond doğruysa değeri "doğru", değilse "yanlış" çıkışına verir.',
  inputs: [
    { name: 'value', label: 'değer', type: T.any, required: true },
    { name: 'cond', label: 'koşul', type: T.boolean, required: true }
  ],
  outputs: [
    { name: 'onTrue', label: 'doğru', type: T.any },
    { name: 'onFalse', label: 'yanlış', type: T.any }
  ],
  execute: ({ inputs }) => (inputs.cond === true ? { onTrue: inputs.value } : { onFalse: inputs.value })
}

/** Tüm converter node'ları. */
export const CONVERTER_NODES: readonly NodeTypeDef[] = [literalNode, getNode, castNode, formatNode, branchNode]
