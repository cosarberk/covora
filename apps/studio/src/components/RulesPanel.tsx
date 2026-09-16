/**
 * @module studio/components/RulesPanel
 *
 * Bir kural kümesini (bir pack'in ya da bir projenin abone olduğu pack'lerin
 * kuralları) listeler, düzenler (önem/ağırlık/durum) ve değişiklik geçmişini
 * (audit) gösterir. Oluşturma yalnızca `onCreate` verildiğinde (pack görünümü)
 * gösterilir.
 */

import type {
  AuditRecord,
  ManagementRule,
  ReviewKind,
  RuleEvaluationType,
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

const makeEmptyForm = (kind: ReviewKind): CreateRuleInput => ({
  key: '',
  title: '',
  kind,
  evaluation: 'llm',
  severity: 'warning',
  weight: 1
})

/**
 * Kural yönetim paneli.
 *
 * @param props - API, yükleyici ve opsiyonel oluşturucu.
 */
export const RulesPanel = ({
  api,
  loadRules,
  onCreate,
  defaultKind = 'ui',
  emptyLabel
}: RulesPanelProps): React.JSX.Element => {
  const [rules, setRules] = useState<readonly ManagementRule[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<CreateRuleInput>(makeEmptyForm(defaultKind))
  const [saving, setSaving] = useState(false)
  const [auditsFor, setAuditsFor] = useState<string | null>(null)
  const [audits, setAudits] = useState<readonly AuditRecord[]>([])

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

  const patchRule = async (ruleId: string, patch: UpdateRuleInput): Promise<void> => {
    setError(null)
    try {
      await api.updateRule(ruleId, patch)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bilinmeyen hata')
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
        <form className="rule-form" onSubmit={(event) => void submit(event)}>
          <input
            className="input"
            placeholder="anahtar"
            value={form.key}
            onChange={(event) => setForm({ ...form, key: event.target.value })}
          />
          <input
            className="input input--grow"
            placeholder="başlık"
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
          />
          <select
            className="select"
            value={form.evaluation}
            onChange={(event) =>
              setForm({ ...form, evaluation: event.target.value as RuleEvaluationType })
            }
          >
            <option value="llm">llm</option>
            <option value="deterministic">deterministic</option>
          </select>
          <select
            className="select"
            value={form.severity}
            onChange={(event) => setForm({ ...form, severity: event.target.value as Severity })}
          >
            {SEVERITIES.map((severity) => (
              <option key={severity} value={severity}>
                {severity}
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
              <th>Tür</th>
              <th>Önem</th>
              <th>Ağırlık</th>
              <th>Durum</th>
              <th>Geçmiş</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <Fragment key={rule.id}>
                <tr>
                  <td className="mono">{rule.key}</td>
                  <td>{rule.title}</td>
                  <td>
                    <span className="badge">{rule.kind}</span>
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
                          {severity}
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
                  <td>
                    <button type="button" className="link-button" onClick={() => void showAudits(rule.id)}>
                      {auditsFor === rule.id ? 'Gizle' : 'Geçmiş'}
                    </button>
                  </td>
                </tr>
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
