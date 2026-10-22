/**
 * @module studio/components/RulesPanel
 *
 * Kural stüdyosu. Bir kural kümesini (pack ya da projenin abone pack'leri)
 * listeler; önem/ağırlık/durumu satır-içi, başlık/talimatı (description)
 * açılır editörle düzenler; değişiklik geçmişini (audit) gösterir. AI kuralları
 * için talimat (description) doğrudan LLM'e giden metindir — burada yazılır.
 * Oluşturma yalnızca `onCreate` verildiğinde (pack görünümü) gösterilir.
 */

import type {
  AuditRecord,
  CheckerInfo,
  ManagementRule,
  ReviewKind,
  Severity
} from '@covora/types'
import { Fragment, useCallback, useEffect, useState } from 'react'

import type { CreateRuleInput, StudioApi, UpdateRuleInput } from '../api/client.js'

/** {@link RulesPanel} props. */
export interface RulesPanelProps {
  readonly api: StudioApi
  /** Kuralları yükleyen fonksiyon (proje ya da pack kaynaklı). */
  readonly loadRules: () => Promise<readonly ManagementRule[]>
  /** Verilirse oluşturma formu gösterilir (pack görünümü). */
  readonly onCreate?: (input: CreateRuleInput) => Promise<void>
  /** Yeni kuralın varsayılan türü (pack türüne kilitlenir). */
  readonly defaultKind?: ReviewKind
  /** Kural yoksa gösterilecek mesaj. */
  readonly emptyLabel: string
}

const SEVERITIES: readonly Severity[] = ['blocker', 'warning', 'info']
const SEVERITY_LABEL: Record<Severity, string> = {
  blocker: 'Blocker',
  warning: 'Uyarı',
  info: 'Bilgi'
}

const makeEmptyForm = (kind: ReviewKind): CreateRuleInput => ({
  key: '',
  title: '',
  description: '',
  kind,
  evaluation: 'llm',
  scope: 'changes',
  severity: 'warning',
  weight: 1
})

/** Kural yönetim paneli (stüdyo). */
export const RulesPanel = ({
  api,
  loadRules,
  onCreate,
  defaultKind = 'ui',
  emptyLabel
}: RulesPanelProps): React.JSX.Element => {
  const [rules, setRules] = useState<readonly ManagementRule[]>([])
  const [checkers, setCheckers] = useState<readonly CheckerInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<CreateRuleInput>(makeEmptyForm(defaultKind))
  const [saving, setSaving] = useState(false)
  const [auditsFor, setAuditsFor] = useState<string | null>(null)
  const [audits, setAudits] = useState<readonly AuditRecord[]>([])
  const [editFor, setEditFor] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftDesc, setDraftDesc] = useState('')
  const [rowSaving, setRowSaving] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      setRules(await loadRules())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bilinmeyen hata')
    } finally {
      setLoading(false)
    }
  }, [loadRules])

  useEffect(() => {
    setForm(makeEmptyForm(defaultKind))
  }, [defaultKind])

  useEffect(() => {
    void load()
  }, [load])

  // Deterministik/ArchUnit kural seçimi için yerleşik checker kataloğu (sadece
  // oluşturma görünümünde gerekir).
  useEffect(() => {
    if (onCreate === undefined) {
      return
    }
    let active = true
    api
      .listCheckers()
      .then((list) => {
        if (active) {
          setCheckers(list)
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [api, onCreate])

  const patchRule = async (ruleId: string, patch: UpdateRuleInput): Promise<void> => {
    setError(null)
    try {
      await api.updateRule(ruleId, patch)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bilinmeyen hata')
    }
  }

  const openEditor = (rule: ManagementRule): void => {
    if (editFor === rule.id) {
      setEditFor(null)
      return
    }
    setEditFor(rule.id)
    setAuditsFor(null)
    setDraftTitle(rule.title)
    setDraftDesc(rule.description)
  }

  const saveEditor = async (ruleId: string): Promise<void> => {
    setRowSaving(true)
    try {
      await patchRule(ruleId, { title: draftTitle.trim(), description: draftDesc })
      setEditFor(null)
    } finally {
      setRowSaving(false)
    }
  }

  const showAudits = async (ruleId: string): Promise<void> => {
    if (auditsFor === ruleId) {
      setAuditsFor(null)
      return
    }
    setError(null)
    try {
      setAudits(await api.listAudits(ruleId))
      setAuditsFor(ruleId)
      setEditFor(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bilinmeyen hata')
    }
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (onCreate === undefined) {
      return
    }
    if (form.key.trim().length === 0 || form.title.trim().length === 0) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onCreate(form)
      setForm(makeEmptyForm(defaultKind))
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bilinmeyen hata')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section>
      {onCreate !== undefined && (
        <form className="rule-form rule-form--card" onSubmit={(event) => void submit(event)}>
          <div className="rule-form__row">
            <select
              className="select"
              value={form.scope === 'project' ? 'arch' : form.evaluation === 'llm' ? 'ai' : 'det'}
              onChange={(event) => {
                const type = event.target.value
                // Tür değişince checker-bağlı alanları sıfırla (yanlış eşleşmeyi önle).
                setForm({
                  ...form,
                  evaluation: type === 'ai' ? 'llm' : 'deterministic',
                  scope: type === 'arch' ? 'project' : 'changes',
                  ...(type === 'ai' ? {} : { key: '', title: '' })
                })
              }}
            >
              <option value="ai">AI-yargı</option>
              <option value="det">Deterministik</option>
              {defaultKind === 'code' && <option value="arch">ArchUnit (proje-geneli)</option>}
            </select>
            {form.evaluation === 'llm' ? (
              <input
                className="input"
                placeholder="anahtar (örn. layout-tutarli)"
                value={form.key}
                onChange={(event) => setForm({ ...form, key: event.target.value })}
              />
            ) : (
              <select
                className="select select--grow"
                value={form.key}
                onChange={(event) => {
                  const chosen = checkers.find((checker) => checker.key === event.target.value)
                  if (chosen === undefined) {
                    setForm({ ...form, key: '' })
                    return
                  }
                  setForm({
                    ...form,
                    key: chosen.key,
                    title: chosen.title,
                    description: chosen.description,
                    scope: chosen.scope
                  })
                }}
              >
                <option value="">— checker seç —</option>
                {checkers
                  .filter(
                    (checker) =>
                      checker.kind === defaultKind &&
                      checker.scope === (form.scope === 'project' ? 'project' : 'changes')
                  )
                  .map((checker) => (
                    <option key={checker.key} value={checker.key}>
                      {checker.title}
                    </option>
                  ))}
              </select>
            )}
            <input
              className="input input--grow"
              placeholder="başlık"
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
            <select
              className="select"
              value={form.severity}
              onChange={(event) => setForm({ ...form, severity: event.target.value as Severity })}
            >
              {SEVERITIES.map((severity) => (
                <option key={severity} value={severity}>
                  {SEVERITY_LABEL[severity]}
                </option>
              ))}
            </select>
            <input
              className="input input--narrow"
              type="number"
              min={0.1}
              step={0.1}
              value={form.weight}
              onChange={(event) => setForm({ ...form, weight: Number(event.target.value) })}
            />
            <button className="button" type="submit" disabled={saving}>
              {saving ? 'Ekleniyor…' : 'Kural Ekle'}
            </button>
          </div>
          <textarea
            className="textarea"
            rows={2}
            placeholder={
              form.evaluation === 'llm'
                ? 'Talimat — AI’ya bu metin sorulur (ör. “Görsel hiyerarşi ve boşluklar tutarlı mı?”)'
                : 'Açıklama (deterministik kural; talimat AI’ya gitmez)'
            }
            value={form.description ?? ''}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </form>
      )}

      {error !== null && <div className="state state--error">{error}</div>}

      {loading ? (
        <div className="state">Yükleniyor…</div>
      ) : rules.length === 0 ? (
        <div className="state">{emptyLabel}</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Anahtar</th>
              <th>Başlık</th>
              <th>Değerlendirme</th>
              <th>Önem</th>
              <th>Ağırlık</th>
              <th>Durum</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <Fragment key={rule.id}>
                <tr>
                  <td className="mono">{rule.key}</td>
                  <td>{rule.title}</td>
                  <td>
                    <span
                      className={`badge ${rule.evaluation === 'llm' ? 'badge--ai' : ''}`}
                      title={rule.scope === 'project' ? 'ArchUnit (proje-geneli)' : rule.kind}
                    >
                      {rule.scope === 'project' ? 'ARCH' : rule.evaluation === 'llm' ? 'AI' : 'DET'}
                    </span>
                  </td>
                  <td>
                    <select
                      className="select select--sm"
                      value={rule.severity}
                      onChange={(event) =>
                        void patchRule(rule.id, { severity: event.target.value as Severity })
                      }
                    >
                      {SEVERITIES.map((severity) => (
                        <option key={severity} value={severity}>
                          {SEVERITY_LABEL[severity]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      key={`${rule.id}-${rule.weight}`}
                      className="input input--narrow"
                      type="number"
                      min={0.1}
                      step={0.1}
                      defaultValue={rule.weight}
                      onBlur={(event) => {
                        const weight = Number(event.target.value)
                        if (weight > 0 && weight !== rule.weight) {
                          void patchRule(rule.id, { weight })
                        }
                      }}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className={rule.enabled ? 'toggle toggle--on' : 'toggle'}
                      onClick={() => void patchRule(rule.id, { enabled: !rule.enabled })}
                    >
                      {rule.enabled ? 'Etkin' : 'Kapalı'}
                    </button>
                  </td>
                  <td className="rule-actions">
                    <button type="button" className="link-button" onClick={() => openEditor(rule)}>
                      {editFor === rule.id ? 'Kapat' : 'Düzenle'}
                    </button>
                    <button type="button" className="link-button" onClick={() => void showAudits(rule.id)}>
                      {auditsFor === rule.id ? 'Gizle' : 'Geçmiş'}
                    </button>
                  </td>
                </tr>
                {editFor === rule.id && (
                  <tr>
                    <td colSpan={7} className="editor-cell">
                      <div className="rule-editor">
                        <label className="field">
                          <span className="field__label">Başlık</span>
                          <input
                            className="input"
                            value={draftTitle}
                            onChange={(event) => setDraftTitle(event.target.value)}
                          />
                        </label>
                        <label className="field">
                          <span className="field__label">
                            {rule.evaluation === 'llm'
                              ? 'Talimat (AI’ya giden metin)'
                              : 'Açıklama'}
                          </span>
                          <textarea
                            className="textarea"
                            rows={4}
                            value={draftDesc}
                            onChange={(event) => setDraftDesc(event.target.value)}
                          />
                        </label>
                        {rule.evaluation === 'llm' && (
                          <p className="field__hint">
                            Bu metin, checklist maddesi olarak AI’ya aynen gönderilir; net ve tek bir
                            kontrolü ifade etmesi sonuçları iyileştirir.
                          </p>
                        )}
                        <div className="rule-editor__actions">
                          <button
                            type="button"
                            className="button"
                            disabled={rowSaving || draftTitle.trim().length === 0}
                            onClick={() => void saveEditor(rule.id)}
                          >
                            {rowSaving ? 'Kaydediliyor…' : 'Kaydet'}
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => setEditFor(null)}
                          >
                            Vazgeç
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                {auditsFor === rule.id && (
                  <tr>
                    <td colSpan={7} className="audit-cell">
                      {audits.length === 0 ? (
                        <span className="mono">Kayıt yok</span>
                      ) : (
                        <ul className="audit-list">
                          {audits.map((audit) => (
                            <li key={audit.id} className="mono">
                              {new Date(audit.createdAt).toLocaleString('tr-TR')} · {audit.action} ·{' '}
                              {audit.changedBy}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
