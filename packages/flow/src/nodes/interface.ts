/**
 * @module @covora/flow/nodes/interface
 *
 * Alt-blueprint kompozisyonu node'ları. `Giriş`/`Çıkış` sınır node'ları bir
 * blueprint'in dış arayüzünü (tipli portlarını) tanımlar; `Alt-Blueprint` node'u
 * başka bir blueprint'i tek node olarak gömer. Sınır node'ları saf pass-through'tur:
 * bağımsız koşunca boş (`Giriş`) / değeri geçiren (`Çıkış`), gömülünce üst graftan
 * değer alışverişinin kapısı olurlar. `Alt-Blueprint` node'u çalıştırma öncesi
 * genişletmede (expandGraph) yerine açıldığından motora hiç ulaşmaz.
 */

import type { NodeTypeDef } from '../node-type.js'
import { T } from '../types.js'
import {
  BOUNDARY_IN_PORT,
  BOUNDARY_OUT_PORT,
  FLOW_TYPE_KEYS,
  INPUT_NODE_TYPE,
  OUTPUT_NODE_TYPE,
  SUBFLOW_NODE_TYPE
} from '../subflow.js'

/** Blueprint'in dış giriş portu (fonksiyon parametresi gibi). */
export const inputNode: NodeTypeDef = {
  type: INPUT_NODE_TYPE,
  category: 'Arayüz',
  label: 'Giriş',
  glyph: '▸',
  description:
    'Bu blueprint\'in dış giriş portu. Başka bir blueprint içine gömülünce dışarıdan değer alır; bağımsız koşunca boştur.',
  inputs: [{ name: BOUNDARY_IN_PORT, label: '(gömülünce dışarıdan)', type: T.any }],
  outputs: [{ name: 'value', label: 'değer', type: T.any }],
  params: [
    { name: 'name', label: 'port adı', control: 'text', placeholder: 'proje' },
    { name: 'label', label: 'etiket', control: 'text', placeholder: '(ops.)' },
    { name: 'type', label: 'tip', control: 'select', options: [...FLOW_TYPE_KEYS], default: 'any' },
    { name: 'required', label: 'zorunlu', control: 'boolean', default: false }
  ],
  execute: ({ inputs }) => ({ value: inputs[BOUNDARY_IN_PORT] })
}

/** Blueprint'in dış çıkış portu (fonksiyon dönüş değeri gibi). */
export const outputNode: NodeTypeDef = {
  type: OUTPUT_NODE_TYPE,
  category: 'Arayüz',
  label: 'Çıkış',
  glyph: '◂',
  description:
    'Bu blueprint\'in dış çıkış portu. Başka bir blueprint içine gömülünce üstteki node\'a değeri verir.',
  inputs: [{ name: 'value', label: 'değer', type: T.any }],
  outputs: [{ name: BOUNDARY_OUT_PORT, label: '(gömülünce dışarıya)', type: T.any }],
  params: [
    { name: 'name', label: 'port adı', control: 'text', placeholder: 'sonuç' },
    { name: 'label', label: 'etiket', control: 'text', placeholder: '(ops.)' },
    { name: 'type', label: 'tip', control: 'select', options: [...FLOW_TYPE_KEYS], default: 'any' }
  ],
  execute: ({ inputs }) => ({ [BOUNDARY_OUT_PORT]: inputs.value })
}

/** Başka bir blueprint'i tek node olarak gömer (çalıştırmada yerine açılır). */
export const subflowNode: NodeTypeDef = {
  type: SUBFLOW_NODE_TYPE,
  category: 'Blueprint',
  label: 'Alt-Blueprint',
  glyph: '▣',
  description:
    'Başka bir blueprint\'i tek node olarak çalıştırır. Portları seçilen blueprint\'in Giriş/Çıkış node\'larından türetilir; çalışırken graf yerinde açılır.',
  inputs: [],
  outputs: [],
  params: [
    { name: 'blueprintKey', label: 'blueprint', control: 'text', placeholder: 'alt-blueprint anahtarı' },
    { name: 'blueprintVersion', label: 'sürüm (ops.)', control: 'number', placeholder: 'en güncel' }
  ],
  execute: () => {
    // Güvenlik ağı: genişletme bu node'u kaldırmalıydı; motora ulaştıysa hata.
    throw new Error('Alt-blueprint genişletilmeden çalıştırılamaz')
  }
}

/** Tüm arayüz/kompozisyon node'ları. */
export const INTERFACE_NODES: readonly NodeTypeDef[] = [inputNode, outputNode, subflowNode]
