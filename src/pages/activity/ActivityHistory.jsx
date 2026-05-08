import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { WITHDRAWAL_LABELS, SOLO_DEPOSIT_LABELS } from '../../lib/scoring'
import NavBtn from '../../components/NavBtn'

export default function ActivityHistory() {
  const { profile, couple } = useAuth()
  const navigate = useNavigate()
  const [deposits, setDeposits] = useState([])
  const [withdrawals, setWithdrawals] = useState([])
  const [tab, setTab] = useState('all')
  const [loading, setLoading] = useState(true)

  const isSolo  = profile?.relationship_mode === 'solo'
  const partner = couple?.partner_a_id === profile?.id ? couple?.partner_b : couple?.partner_a

  useEffect(() => {
    if (!profile?.id) return
    if (isSolo || couple?.id) fetchAll()
  }, [profile?.id, couple?.id, isSolo])

  async function fetchAll() {
    setLoading(true)
    if (isSolo) {
      const { data: deps } = await supabase
        .from('deposits')
        .select('*')
        .eq('logger_id', profile.id)
        .is('couple_id', null)
        .order('created_at', { ascending: false })
      setDeposits(deps ?? [])
      setWithdrawals([])
      setLoading(false)
      return
    }
    const [{ data: deps }, { data: wds }] = await Promise.all([
      supabase.from('deposits').select('*').eq('couple_id', couple.id).order('created_at', { ascending:false }),
      supabase.from('withdrawals').select('*').eq('couple_id', couple.id).order('created_at', { ascending:false }),
    ])
    setDeposits(deps ?? [])
    setWithdrawals(wds ?? [])
    setLoading(false)
  }

  const myDeposits     = deposits.filter(d => d.logger_id === profile.id)
  const theirDeposits  = deposits.filter(d => d.receiver_id === profile.id)
  const myWithdrawals  = withdrawals.filter(w => w.logger_id === profile.id)

  const totalIn  = deposits.filter(d => d.logger_id === profile.id && d.tokens_applied).reduce((s, d) => s + d.final_value, 0)
  const totalOut = myWithdrawals.reduce((s, w) => s + w.cost, 0)
  const net      = totalIn - totalOut

  return (
    <div style={{ minHeight:'100vh', background:'var(--cream)', paddingBottom:100 }}>
      <div className="page-header">
        <button className="btn-back" onClick={() => navigate('/')}>←</button>
        <p className="page-title">Balance sheet</p>
        <div style={{ width:32 }} />
      </div>

      {/* Summary */}
      <div style={{ padding:'16px 20px' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:20 }}>
          <SummaryCard label="Total in"  value={`+${totalIn}`}  color="var(--teal)" />
          <SummaryCard label="Total out" value={`−${totalOut}`} color="var(--red)" />
          <SummaryCard label="Net"       value={net >= 0 ? `+${net}` : `${net}`} color={net >= 0 ? 'var(--teal)' : 'var(--red)'} />
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', gap:6, marginBottom:16 }}>
          {(isSolo ? [['all','All'],['deposits','Deposits']] : [['all','All'],['deposits','Deposits'],['withdrawals','Withdrawals']]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                padding:'6px 14px', borderRadius:100, fontSize:12, fontWeight:500, cursor:'pointer',
                border: tab === id ? 'none' : '1px solid var(--line)',
                background: tab === id ? 'var(--ink)' : 'transparent',
                color: tab === id ? 'var(--white)' : 'var(--muted)',
                transition:'all 0.15s',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ textAlign:'center', color:'var(--muted)', padding:'32px 0' }}>Loading…</p>
        ) : (
          <div>
            {(tab === 'all' || tab === 'deposits') && (
              <>
                {tab === 'all' && <p className="section-label">Your deposits</p>}
                {myDeposits.length === 0
                  ? <Empty>Nothing logged yet. Make your first deposit and it'll show up here.</Empty>
                  : myDeposits.map(d => <DepositRow key={d.id} deposit={d} partnerName={partner?.display_name} />)
                }
              </>
            )}

            {!isSolo && (tab === 'all' || tab === 'deposits') && theirDeposits.length > 0 && (
              <>
                <p className="section-label" style={{ marginTop:20 }}>{partner?.display_name}'s deposits to you</p>
                {theirDeposits.map(d => <DepositRow key={d.id} deposit={d} isTheirs partnerName={partner?.display_name} onRepair={() => {}} />)}
              </>
            )}

            {!isSolo && (tab === 'all' || tab === 'withdrawals') && (
              <>
                {tab === 'all' && <p className="section-label" style={{ marginTop:20 }}>Your withdrawals</p>}
                {myWithdrawals.length === 0
                  ? <Empty>No withdrawals logged. Honest tracking builds a real picture — log one if something happened.</Empty>
                  : myWithdrawals.map(w => (
                    <WithdrawalRow
                      key={w.id}
                      withdrawal={w}
                      onRepair={() => navigate(`/repair/${w.id}`)}
                    />
                  ))
                }
              </>
            )}
          </div>
        )}
      </div>

      <nav aria-label="Main navigation" style={{ position:'fixed', bottom:0, left:'50%', transform:'translateX(-50%)', width:'100%', maxWidth:430, background:'rgba(250,246,239,0.96)', backdropFilter:'blur(16px)', borderTop:'0.5px solid var(--line)', display:'flex', padding:'10px 0 28px', zIndex:50 }}>
        <NavBtn icon="home"     label="Home"     onClick={() => navigate('/')} />
        <NavBtn icon="deposit"  label="Deposit"  onClick={() => navigate(isSolo ? '/solo-deposit' : '/deposit')} />
        <NavBtn icon="games"    label="Games"    onClick={() => navigate('/games')} />
        <NavBtn icon="history"  label="History"  active onClick={() => {}} />
        <NavBtn icon="settings" label="Settings" onClick={() => navigate('/settings')} />
      </nav>
    </div>
  )
}

function SummaryCard({ label, value, color }) {
  return (
    <div style={{ background:'var(--white)', border:'0.5px solid var(--line)', borderRadius:12, padding:'12px', textAlign:'center' }}>
      <p style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>{label}</p>
      <p style={{ fontSize:18, fontWeight:600, color }}>{value}</p>
    </div>
  )
}

function DepositRow({ deposit, partnerName, isTheirs }) {
  const STATUS_COLORS = { pending:'var(--muted)', confirmed:'var(--teal)', flagged:'var(--red)', adjusted:'var(--amber)', expired:'var(--muted)' }
  const label = SOLO_DEPOSIT_LABELS[deposit.deposit_type] ?? deposit.deposit_type.replace(/_/g, ' ')
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom:'0.5px solid var(--line)' }}>
      <div style={{ width:6, height:6, borderRadius:'50%', flexShrink:0, background:'var(--teal)' }} />
      <div style={{ flex:1 }}>
        <p style={{ fontSize:13, fontWeight:500 }}>{label}</p>
        <p style={{ fontSize:11, color:'var(--muted)' }}>
          {isTheirs ? partnerName : 'You'} · {formatDate(deposit.created_at)} ·{' '}
          <span style={{ color: STATUS_COLORS[deposit.status] ?? 'var(--muted)' }}>{deposit.status}</span>
        </p>
      </div>
      <p style={{ fontSize:13, fontWeight:600, color:'var(--teal)', flexShrink:0 }}>+{deposit.final_value}</p>
    </div>
  )
}

function WithdrawalRow({ withdrawal, onRepair }) {
  const withinWindow = new Date(withdrawal.repair_window_ends_at) > new Date()
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom:'0.5px solid var(--line)' }}>
      <div style={{ width:6, height:6, borderRadius:'50%', flexShrink:0, background: withdrawal.repaired ? 'var(--teal)' : 'var(--red)' }} />
      <div style={{ flex:1 }}>
        <p style={{ fontSize:13, fontWeight:500 }}>{WITHDRAWAL_LABELS[withdrawal.withdrawal_type] ?? withdrawal.withdrawal_type}</p>
        <p style={{ fontSize:11, color:'var(--muted)' }}>
          You · {formatDate(withdrawal.created_at)} · {withdrawal.repaired ? 'repaired' : withinWindow ? 'repair open' : 'unrepaired'}
        </p>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
        <p style={{ fontSize:13, fontWeight:600, color:'var(--red)' }}>−{withdrawal.cost}</p>
        {!withdrawal.repaired && withinWindow && (
          <button
            onClick={onRepair}
            style={{ fontSize:11, padding:'4px 10px', borderRadius:100, background:'var(--teal-p)', color:'var(--teal)', border:'none', cursor:'pointer', fontWeight:500 }}
          >
            Repair
          </button>
        )}
      </div>
    </div>
  )
}

function Empty({ children }) {
  return <p style={{ fontSize:13, color:'var(--muted)', padding:'16px 0' }}>{children}</p>
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month:'short', day:'numeric' })
}
