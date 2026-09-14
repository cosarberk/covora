/**
 * @module studio/components/RulesPanel
 *
 * Bir projenin kurallarını listeler ve yeni kural oluşturur.
 */

import type { ReviewKind, Rule, RuleEvaluationType, Severity } from '@covora/types'
import { useCallback, useEffect, useState } from 'react'

import type { CreateRuleInput, StudioApi } from '../api/client.js'

/** {@link RulesPanel} props. */
export interface RulesPanelProps {
  readonly api: StudioApi
  readonly projectKey: string
}

const emptyForm: CreateRuleInput = {
  key: '',
  title: '',
  kind: 'ui',
  evaluation: 'llm',
  severity: 'warning',
  weight: 1
}

/**
 * Kural listeleme ve oluşturma paneli.
 *
 * @param props - API ve proje anahtarı.
 */
export const RulesPanel = ({ api, projectKey }: RulesPanelProps): React.JSX.Element => {
  const [rules, setRules] = useState<readonly Rule[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<CreateRuleInput>(emptyForm)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      setRules(await api.listRules(projectKey))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bilinmeyen hata')
    } finally {
      setLoading(false)
    }
  }, [api, projectKey])

  useEffect(() => {
    void load()
  }, [load])

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    if (form.key.trim().length === 0 || form.title.trim().length === 0) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      await api.createRule(projectKey, form)
      setForm(emptyForm)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bilinmeyen hata')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section>
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
          value={form.kind}
          onChange={(event) => setForm({ ...form, kind: event.target.value as ReviewKind })}
        >
          <option value="ui">ui</option>
          <option value="code">code</option>
        </select>
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
          <option value="blocker">blocker</option>
          <option value="warning">warning</option>
          <option value="info">info</option>
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

      {error !== null && <div className="state state--error">{error}</div>}

      {loading ? (
        <div className="state">Yükleniyor…</div>
      ) : rules.length === 0 ? (
        <div className="state">Bu proje için kural yok.</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Anahtar</th>
              <th>Başlık</th>
              <th>Tür</th>
              <th>Değerlendirme</th>
              <th>Önem</th>
              <th>Ağırlık</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id}>
                <td className="mono">{rule.id}</td>
                <td>{rule.title}</td>
                <td>
                  <span className="badge">{rule.kind}</span>
                </td>
                <td>{rule.evaluation}</td>
                <td>
                  <span className={`badge badge--${rule.severity}`}>{rule.severity}</span>
                </td>
                <td>{rule.weight}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
