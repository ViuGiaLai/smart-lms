'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'

const methods = [
  { id: 'momo_demo', label: 'MoMo mô phỏng' },
  { id: 'vnpay_demo', label: 'VNPay mô phỏng' },
  { id: 'bank_demo', label: 'Chuyển khoản mô phỏng' },
]

interface Order {
  orderId?: string
  title?: string
  amount?: string
  enrolled: boolean
}

interface Payment {
  id: string
  title: string
  amount: string
  status: string
  method: string
}

const currency = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
const statuses: Record<string, string> = { success: 'Thành công', failed: 'Thất bại', cancelled: 'Đã hủy' }

function errorMessage(error: unknown, fallback: string) {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof detail === 'string' ? detail : fallback
}

export default function CheckoutPage() {
  const { id } = useParams<{ id: string }>()
  const { user, isLoading } = useAuth()
  const [order, setOrder] = useState<Order | null>(null)
  const [history, setHistory] = useState<Payment[]>([])
  const [historyError, setHistoryError] = useState('')
  const [error, setError] = useState('')
  const [method, setMethod] = useState(methods[0].id)
  const [busy, setBusy] = useState(false)
  const [loadCount, setLoadCount] = useState(0)

  const loadHistory = () => api.get('/api/v1/checkout/history').then((response) => {
    setHistory(response.data.data)
    setHistoryError('')
  }).catch(() => setHistoryError('Chưa tải được lịch sử giao dịch.'))

  useEffect(() => {
    if (isLoading || user?.role !== 'student') return
    let active = true
    setOrder(null)
    setError('')
    api.post<Order>(`/api/v1/checkout/courses/${encodeURIComponent(id)}`).then((response) => {
      if (active) setOrder(response.data)
    }).catch((reason) => {
      if (active) setError(errorMessage(reason, 'Chưa tải được đơn hàng.'))
    })
    void loadHistory()
    return () => { active = false }
  }, [id, isLoading, loadCount, user?.role])

  const confirm = async (outcome: 'success' | 'failed' | 'cancelled') => {
    if (!order?.orderId || busy) return
    setBusy(true)
    setError('')
    try {
      const { data } = await api.post(`/api/v1/checkout/orders/${order.orderId}/confirm`, {
        method, outcome, expected_amount: order.amount,
      })
      if (data.status === 'paid' || data.status === 'enrolled') setOrder({ ...order, enrolled: true })
      else setError(data.status === 'failed' ? 'Giao dịch mô phỏng thất bại. Bạn có thể thử lại.' : 'Đã hủy giao dịch mô phỏng.')
      void loadHistory()
    } catch (reason) {
      setError(errorMessage(reason, 'Chưa xác nhận được giao dịch.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-8">
      <Link href={`/courses/${encodeURIComponent(id)}`} className="text-sm font-semibold text-primary hover:underline">← Chi tiết khóa học</Link>
      <PageHeader title="Thanh toán Demo" description="Mô phỏng ghi danh khóa học có học phí. Không phát sinh giao dịch tiền thật và không yêu cầu thông tin ngân hàng." />
      {error && <ErrorState message={error} actionLabel={!order ? 'Tải lại' : undefined} onAction={() => setLoadCount((count) => count + 1)} />}
      {isLoading ? <p role="status">Đang kiểm tra tài khoản…</p> : user?.role !== 'student' ? (
        <ErrorState message="Chỉ tài khoản học viên có thể thanh toán khóa học." />
      ) : !order && !error ? <p role="status">Đang chuẩn bị đơn hàng…</p> : order?.enrolled ? (
        <div role="status" className="space-y-3 rounded-xl border border-border bg-card p-5">
          <p className="font-semibold">Khóa học đã được mở cho tài khoản của bạn.</p>
          <Button asChild><Link href={`/courses/${encodeURIComponent(id)}/learn`}>Vào học</Link></Button>
        </div>
      ) : order && (
        <div className="space-y-5 rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">{order.title}</h2>
            <p className="text-lg font-semibold">{currency.format(Number(order.amount))}</p>
          </div>
          <fieldset disabled={busy} className="space-y-2">
            <legend className="mb-2 text-sm font-semibold">Phương thức mô phỏng</legend>
            {methods.map((item) => (
              <label key={item.id} className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm">
                <input type="radio" name="method" checked={method === item.id} onChange={() => setMethod(item.id)} />
                {item.label}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void confirm('success')}>{busy ? 'Đang xác nhận…' : 'Thanh toán Demo'}</Button>
            <Button disabled={busy} variant="outline" onClick={() => void confirm('failed')}>Mô phỏng lỗi</Button>
            <Button disabled={busy} variant="ghost" onClick={() => void confirm('cancelled')}>Hủy giao dịch</Button>
          </div>
        </div>
      )}
      {order && (
        <section className="space-y-3" aria-labelledby="payment-history">
          <h2 id="payment-history" className="text-lg font-semibold">Lịch sử giao dịch Demo</h2>
          {historyError ? <ErrorState message={historyError} actionLabel="Thử lại" onAction={() => void loadHistory()} /> : history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Bạn chưa có giao dịch mô phỏng.</p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border bg-card">
              {history.map((payment) => (
                <li key={payment.id} className="flex flex-wrap items-start justify-between gap-2 p-4 text-sm">
                  <div><p className="font-medium">{payment.title}</p><p className="text-muted-foreground">{methods.find((item) => item.id === payment.method)?.label} · {statuses[payment.status] ?? payment.status}</p></div>
                  <p className="font-semibold">{currency.format(Number(payment.amount))}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </section>
  )
}
