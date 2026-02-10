
import React, { useState, useMemo, useEffect } from 'react';
import { 
  User, UserRole, View, Supplier, Invoice, InvoiceStatus 
} from './types.ts';
import { ICONS } from './constants.tsx';
import { analyzeInvoice } from './services/geminiService.ts';

// --- MOCK DATA ---
const INITIAL_SUPPLIERS: Supplier[] = [
  { id: 'S1', name: 'LimpiaTodo SRL', email: 'limpieza@huerta.com', taxId: '30-12345678-9', balance: 45000, totalPaid: 120000 },
  { id: 'S2', name: 'Electricidad Sur', email: 'energia@elsur.com', taxId: '30-87654321-0', balance: 89000, totalPaid: 250000 },
  { id: 'S3', name: 'Catering Huerta', email: 'chef@catering.com', taxId: '20-11223344-5', balance: 12000, totalPaid: 45000 },
];

const INITIAL_INVOICES: Invoice[] = [
  { id: 'I1', supplierId: 'S1', invoiceNumber: 'A-0001-00234', amount: 25000, currency: 'ARS', uploadDate: '2024-03-01', status: InvoiceStatus.PAID, paymentDate: '2024-03-15' },
  { id: 'I2', supplierId: 'S1', invoiceNumber: 'A-0001-00235', amount: 45000, currency: 'ARS', uploadDate: '2024-03-20', status: InvoiceStatus.SCHEDULED, estimatedPaymentDate: '2024-04-05' },
  { id: 'I3', supplierId: 'S2', invoiceNumber: 'B-0452-11234', amount: 89000, currency: 'ARS', uploadDate: '2024-03-22', status: InvoiceStatus.PENDING },
];

// --- GRAFICOS SVG VIBRANTES ---

const VibrantBarChart: React.FC<{ data: { name: string, value: number }[] }> = ({ data }) => {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="w-full h-full flex items-end justify-around gap-4 pt-8 px-2">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center group h-full justify-end relative">
          <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-all bg-slate-800 text-white px-2 py-1 rounded text-[10px] font-bold z-10 whitespace-nowrap">
            ${d.value.toLocaleString()}
          </div>
          <div 
            className="w-full max-w-[32px] rounded-t-md transition-all duration-500 relative"
            style={{ 
              height: `${(d.value / max) * 100}%`,
              background: `linear-gradient(to top, #4f46e5, #ec4899)`,
              boxShadow: '0 4px 12px -2px rgba(79, 70, 229, 0.3)'
            }}
          />
          <span className="text-[9px] font-bold text-slate-500 mt-2 uppercase truncate w-full text-center">{d.name}</span>
        </div>
      ))}
    </div>
  );
};

const VibrantDonutChart: React.FC<{ data: { label: string, value: number, color: string }[] }> = ({ data }) => {
  const total = data.reduce((acc, d) => acc + d.value, 0);
  let cumulativePercent = 0;

  function getCoordinatesForPercent(percent: number) {
    const x = Math.cos(2 * Math.PI * percent);
    const y = Math.sin(2 * Math.PI * percent);
    return [x, y];
  }

  return (
    <div className="w-full h-full flex flex-col md:flex-row items-center justify-around p-2 gap-4">
      <svg viewBox="-1.1 -1.1 2.2 2.2" className="w-32 h-32 md:w-40 md:h-40 -rotate-90">
        {data.map((d, i) => {
          if (d.value === 0) return null;
          const [startX, startY] = getCoordinatesForPercent(cumulativePercent);
          cumulativePercent += d.value / (total || 1);
          const [endX, endY] = getCoordinatesForPercent(cumulativePercent);
          const largeArcFlag = d.value / (total || 1) > 0.5 ? 1 : 0;
          const pathData = `M ${startX} ${startY} A 1 1 0 ${largeArcFlag} 1 ${endX} ${endY} L 0 0`;
          return <path key={i} d={pathData} fill={d.color} className="hover:opacity-80 transition-opacity cursor-pointer" />;
        })}
        <circle r="0.7" fill="white" />
        <text x="0" y="0" textAnchor="middle" dy=".3em" fill="#1e293b" fontSize="0.2" fontWeight="800" transform="rotate(90)">
          {total} OPS
        </text>
      </svg>
      <div className="flex flex-col gap-2">
        {data.map((d, i) => (
          <div key={i} className="flex items-center space-x-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }}></div>
            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">{d.label}: {d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- COMPONENTES UI ---

const StatusBadge: React.FC<{ status: InvoiceStatus }> = ({ status }) => {
  const themes = {
    [InvoiceStatus.PENDING]: 'bg-orange-50 text-orange-600 border-orange-200',
    [InvoiceStatus.SCHEDULED]: 'bg-blue-50 text-blue-600 border-blue-200',
    [InvoiceStatus.PAID]: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    [InvoiceStatus.REJECTED]: 'bg-rose-50 text-rose-600 border-rose-200',
  };
  const labels = {
    [InvoiceStatus.PENDING]: 'Pendiente',
    [InvoiceStatus.SCHEDULED]: 'En Agenda',
    [InvoiceStatus.PAID]: 'Liquidada',
    [InvoiceStatus.REJECTED]: 'Rechazada',
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${themes[status]}`}>
      {labels[status]}
    </span>
  );
};

// --- APP COMPONENT ---

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<View>('LOGIN');
  const [suppliers, setSuppliers] = useState<Supplier[]>(INITIAL_SUPPLIERS);
  const [invoices, setInvoices] = useState<Invoice[]>(INITIAL_INVOICES);
  const [isAiProcessing, setIsAiProcessing] = useState(false);

  const stats = useMemo(() => {
    const pending = invoices.filter(i => i.status === InvoiceStatus.PENDING);
    const scheduled = invoices.filter(i => i.status === InvoiceStatus.SCHEDULED);
    const paid = invoices.filter(i => i.status === InvoiceStatus.PAID);
    const totalDebt = invoices.filter(i => i.status !== InvoiceStatus.PAID).reduce((a, b) => a + (b.amount || 0), 0);
    return { pending, scheduled, paid, totalDebt };
  }, [invoices]);

  const supplierInvoices = useMemo(() => {
    if (!user || user.role !== UserRole.SUPPLIER) return [];
    return invoices.filter(inv => inv.supplierId === user.supplierId);
  }, [invoices, user]);

  const handleLogin = (role: UserRole, supplierId?: string) => {
    const found = suppliers.find(s => s.id === supplierId);
    setUser({
      id: role === UserRole.ADMIN ? 'A-1' : `S-${supplierId}`,
      name: role === UserRole.ADMIN ? 'Tesorero Huerta' : found?.name || 'Proveedor',
      email: role === UserRole.ADMIN ? 'admin@huerta.com' : 'externo@huerta.com',
      role,
      supplierId
    });
    setCurrentView(role === UserRole.ADMIN ? 'ADMIN_DASHBOARD' : 'SUPPLIER_DASHBOARD');
  };

  const handleLogout = () => {
    setUser(null);
    setCurrentView('LOGIN');
  };

  const updateStatus = (id: string, status: InvoiceStatus) => {
    setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, status } : inv));
  };

  if (currentView === 'LOGIN') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-white rounded-[2.5rem] p-12 text-center shadow-2xl border border-slate-200 animate-fade-in">
          <div className="w-16 h-16 bg-black rounded-2xl mx-auto flex items-center justify-center text-white mb-8 shadow-xl">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.546 1.16 3.74.905 5.025-.506L14.94 13.5c-1.285-1.41-3.479-1.666-5.025-.506L8.94 13.5c1.546-1.16 3.74-.905 5.025.506l.879-.659c1.546-1.16 3.74-.905 5.025.506" />
            </svg>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tighter mb-1">HUERTA PAGO</h1>
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.3em] mb-12">Portal Financiero</p>
          
          <div className="space-y-3">
            <button 
              onClick={() => handleLogin(UserRole.ADMIN)}
              className="w-full py-4 bg-black text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95 shadow-lg"
            >
              Acceso Staff
            </button>
            <div className="flex items-center space-x-4 py-4">
              <div className="h-px bg-slate-100 flex-1"></div>
              <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">Proveedores</span>
              <div className="h-px bg-slate-100 flex-1"></div>
            </div>
            {suppliers.map(s => (
              <button 
                key={s.id}
                onClick={() => handleLogin(UserRole.SUPPLIER, s.id)}
                className="w-full py-3 bg-white border border-slate-200 text-slate-600 hover:text-black hover:border-black rounded-2xl text-[10px] font-bold transition-all uppercase tracking-widest"
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Sidebar Negra - Elegante */}
      <aside className="w-64 sidebar h-screen fixed left-0 top-0 flex flex-col z-50">
        <div className="p-8 flex items-center space-x-3 mb-8">
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-black font-black text-xs">H</div>
          <span className="font-extrabold text-sm tracking-widest uppercase italic text-white">Huerta</span>
        </div>
        
        <nav className="flex-1 px-4 space-y-1">
          <button 
            onClick={() => setCurrentView(user?.role === UserRole.ADMIN ? 'ADMIN_DASHBOARD' : 'SUPPLIER_DASHBOARD')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${currentView.includes('DASHBOARD') ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-white'}`}
          >
            <ICONS.Dashboard />
            <span className="text-[10px] font-bold uppercase tracking-widest">Resumen</span>
          </button>
          
          {user?.role === UserRole.SUPPLIER && (
            <button 
              onClick={() => setCurrentView('INVOICE_UPLOAD')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${currentView === 'INVOICE_UPLOAD' ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-white'}`}
            >
              <ICONS.Upload />
              <span className="text-[10px] font-bold uppercase tracking-widest">Subir Factura</span>
            </button>
          )}

          {user?.role === UserRole.ADMIN && (
            <button 
              onClick={() => setCurrentView('SUPPLIER_LIST')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${currentView === 'SUPPLIER_LIST' ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-white'}`}
            >
              <ICONS.Users />
              <span className="text-[10px] font-bold uppercase tracking-widest">Proveedores</span>
            </button>
          )}
        </nav>

        <div className="p-6">
          <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
            <div className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">{user?.role}</div>
            <div className="text-xs font-bold text-white truncate mb-4">{user?.name}</div>
            <button onClick={handleLogout} className="text-[9px] font-bold text-slate-400 hover:text-white transition-all uppercase tracking-widest underline underline-offset-4 decoration-slate-700">Cerrar Sesión</button>
          </div>
        </div>
      </aside>

      {/* Main Content Area - Blanca / Gris Claro */}
      <main className="flex-1 ml-64 p-12">
        <div className="max-w-5xl mx-auto space-y-10">
          
          {currentView === 'ADMIN_DASHBOARD' && (
            <div className="space-y-10 animate-fade-in">
              <header className="flex justify-between items-end">
                <div>
                  <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight mb-1">Tesorería</h1>
                  <p className="text-slate-500 text-sm font-medium uppercase tracking-[0.2em]">Dashboard Operativo</p>
                </div>
                <div className="flex space-x-2">
                   <div className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-black cursor-pointer shadow-sm"><ICONS.Bell /></div>
                </div>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="premium-card p-6 rounded-3xl">
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Deuda Total</p>
                  <p className="text-3xl font-black text-slate-900 tracking-tighter">${stats.totalDebt.toLocaleString()}</p>
                </div>
                <div className="premium-card p-6 rounded-3xl border-l-4 border-l-orange-400">
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Por Revisar</p>
                  <p className="text-3xl font-black text-orange-500 tracking-tighter">{stats.pending.length}</p>
                </div>
                <div className="premium-card p-6 rounded-3xl border-l-4 border-l-blue-400">
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Agendados</p>
                  <p className="text-3xl font-black text-blue-500 tracking-tighter">{stats.scheduled.length}</p>
                </div>
                <div className="premium-card p-6 rounded-3xl border-l-4 border-l-emerald-400">
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">Pagados</p>
                  <p className="text-3xl font-black text-emerald-500 tracking-tighter">{stats.paid.length}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="premium-card p-8 rounded-[2rem] h-[350px] flex flex-col">
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6">Pasivo por Proveedor</h3>
                  <div className="flex-1">
                    <VibrantBarChart data={suppliers.map(s => ({ 
                      name: s.name, 
                      value: invoices.filter(i => i.supplierId === s.id && i.status !== InvoiceStatus.PAID).reduce((a, b) => a + (b.amount || 0), 0) 
                    }))} />
                  </div>
                </div>
                <div className="premium-card p-8 rounded-[2rem] h-[350px] flex flex-col">
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6">Distribución de Facturas</h3>
                  <div className="flex-1">
                    <VibrantDonutChart data={[
                      { label: 'Pendientes', value: stats.pending.length, color: '#f97316' },
                      { label: 'Agenda', value: stats.scheduled.length, color: '#3b82f6' },
                      { label: 'Liquidadas', value: stats.paid.length, color: '#10b981' }
                    ]} />
                  </div>
                </div>
              </div>

              <div className="premium-card rounded-[2rem] overflow-hidden">
                <div className="px-8 py-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Últimos Movimientos</h3>
                </div>
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50/50">
                      <th className="px-8 py-4 text-[9px] font-bold text-slate-400 uppercase">Proveedor</th>
                      <th className="px-8 py-4 text-[9px] font-bold text-slate-400 uppercase">Factura</th>
                      <th className="px-8 py-4 text-[9px] font-bold text-slate-400 uppercase text-right">Monto</th>
                      <th className="px-8 py-4 text-[9px] font-bold text-slate-400 uppercase text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invoices.map(inv => (
                      <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-8 py-5">
                          <div className="text-sm font-bold text-slate-900">{suppliers.find(s => s.id === inv.supplierId)?.name}</div>
                          <div className="text-[10px] text-slate-400 font-medium">{inv.uploadDate}</div>
                        </td>
                        <td className="px-8 py-5 text-xs font-mono text-slate-500">{inv.invoiceNumber}</td>
                        <td className="px-8 py-5 text-sm font-black text-slate-900 text-right">${inv.amount.toLocaleString()}</td>
                        <td className="px-8 py-5 text-right">
                          <div className="flex justify-end space-x-2">
                            {inv.status === InvoiceStatus.PENDING && (
                              <button onClick={() => updateStatus(inv.id, InvoiceStatus.SCHEDULED)} className="bg-black text-white px-4 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest hover:bg-slate-800 transition-all">Aprobar</button>
                            )}
                            {inv.status === InvoiceStatus.SCHEDULED && (
                              <button onClick={() => updateStatus(inv.id, InvoiceStatus.PAID)} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest hover:bg-blue-500 transition-all shadow-md">Liquidar</button>
                            )}
                            {inv.status === InvoiceStatus.PAID && <StatusBadge status={inv.status} />}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {currentView === 'SUPPLIER_DASHBOARD' && (
            <div className="space-y-10 animate-fade-in">
              <header>
                <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight mb-1 italic">Estado de Cuenta</h1>
                <p className="text-slate-500 text-sm font-medium uppercase tracking-[0.2em]">{user?.name}</p>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="premium-card p-8 rounded-[2rem] border-l-4 border-l-blue-500">
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-3">Pendiente de Cobro</p>
                  <p className="text-4xl font-black text-slate-900 tracking-tighter">
                    ${supplierInvoices.filter(i => i.status !== InvoiceStatus.PAID).reduce((a, b) => a + (b.amount || 0), 0).toLocaleString()}
                  </p>
                </div>
                <div className="premium-card p-8 rounded-[2rem]">
                  <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-3">Total Liquidado</p>
                  <p className="text-4xl font-black text-slate-300 tracking-tighter">
                    ${supplierInvoices.filter(i => i.status === InvoiceStatus.PAID).reduce((a, b) => a + (b.amount || 0), 0).toLocaleString()}
                  </p>
                </div>
                <button onClick={() => setCurrentView('INVOICE_UPLOAD')} className="bg-black text-white p-8 rounded-[2rem] flex flex-col items-center justify-center hover:bg-slate-800 transition-all active:scale-95 shadow-xl group">
                  <div className="group-hover:translate-y-[-4px] transition-transform"><ICONS.Upload /></div>
                  <span className="mt-3 font-bold text-[10px] uppercase tracking-widest">Cargar Factura</span>
                </button>
              </div>

              <div className="premium-card rounded-[2rem] overflow-hidden">
                <div className="px-8 py-5 border-b border-slate-100">
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Cronograma de Pagos</h3>
                </div>
                <table className="w-full text-left">
                  <thead className="bg-slate-50/50">
                    <tr>
                      <th className="px-8 py-4 text-[9px] font-bold text-slate-400 uppercase">Fecha</th>
                      <th className="px-8 py-4 text-[9px] font-bold text-slate-400 uppercase">Nº Comprobante</th>
                      <th className="px-8 py-4 text-[9px] font-bold text-slate-400 uppercase text-right">Importe</th>
                      <th className="px-8 py-4 text-[9px] font-bold text-slate-400 uppercase text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {supplierInvoices.map(inv => (
                      <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-8 py-6 text-xs text-slate-500 font-medium">{inv.uploadDate}</td>
                        <td className="px-8 py-6 text-sm font-bold text-slate-900 tracking-wide">{inv.invoiceNumber}</td>
                        <td className="px-8 py-6 text-sm font-black text-slate-900 text-right">${inv.amount.toLocaleString()}</td>
                        <td className="px-8 py-6 text-center"><StatusBadge status={inv.status} /></td>
                      </tr>
                    ))}
                    {supplierInvoices.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-8 py-20 text-center text-slate-400 text-xs font-bold uppercase tracking-widest italic">No hay registros aún</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {currentView === 'INVOICE_UPLOAD' && (
            <div className="max-w-xl mx-auto space-y-10 py-10 animate-fade-in">
              <header className="text-center">
                <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight mb-3">Nueva Factura</h1>
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.4em]">Digitalización vía IA</p>
              </header>

              <div className="premium-card p-12 rounded-[3rem] shadow-2xl relative">
                <label className="flex flex-col items-center justify-center w-full h-72 border-2 border-slate-200 border-dashed rounded-[2.5rem] cursor-pointer bg-slate-50/50 hover:border-black transition-all group">
                  <div className="bg-black text-white p-6 rounded-2xl mb-5 group-hover:scale-110 transition-transform shadow-lg">
                    <ICONS.Upload />
                  </div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest group-hover:text-black transition-colors">Seleccionar Archivo</p>
                  <p className="text-[9px] text-slate-400 mt-2 font-medium uppercase tracking-widest">Formatos: PDF, JPG, PNG</p>
                  <input type="file" className="hidden" disabled={isAiProcessing} onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setIsAiProcessing(true);
                    const reader = new FileReader();
                    reader.onload = async () => {
                      const base64 = (reader.result as string).split(',')[1];
                      const data = await analyzeInvoice(base64);
                      if (data) {
                        const newInv: Invoice = {
                          id: `INV-${Date.now()}`,
                          supplierId: user?.supplierId || 'S1',
                          invoiceNumber: data.invoiceNumber || `TMP-${Math.floor(Math.random()*9999)}`,
                          amount: data.amount || 0,
                          currency: (data.currency as any) || 'ARS',
                          uploadDate: new Date().toISOString().split('T')[0],
                          status: InvoiceStatus.PENDING
                        };
                        setInvoices(prev => [newInv, ...prev]);
                        setCurrentView('SUPPLIER_DASHBOARD');
                      }
                      setIsAiProcessing(false);
                    };
                    reader.readAsDataURL(file);
                  }} />
                </label>

                {isAiProcessing && (
                  <div className="mt-8 text-center space-y-3">
                    <div className="w-8 h-8 border-4 border-slate-100 border-t-black rounded-full mx-auto animate-spin"></div>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.5em]">Extrayendo Datos...</p>
                  </div>
                )}

                <div className="mt-10 text-center">
                  <button onClick={() => setCurrentView('SUPPLIER_DASHBOARD')} className="text-[10px] font-bold text-slate-400 hover:text-black uppercase tracking-widest transition-all">← Cancelar carga</button>
                </div>
              </div>
            </div>
          )}

          {currentView === 'SUPPLIER_LIST' && (
            <div className="space-y-10 animate-fade-in">
              <header>
                <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight mb-1 italic">Partners</h1>
                <p className="text-slate-500 text-sm font-medium uppercase tracking-[0.2em]">Listado de Proveedores</p>
              </header>

              <div className="grid grid-cols-1 gap-4">
                {suppliers.map(s => (
                  <div key={s.id} className="premium-card p-8 rounded-[2rem] flex justify-between items-center group">
                    <div>
                      <h4 className="text-lg font-extrabold text-slate-900 group-hover:text-indigo-600 transition-colors">{s.name}</h4>
                      <p className="text-xs text-slate-400 mt-1 font-medium uppercase tracking-widest">{s.taxId} • {s.email}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-slate-300 text-[9px] font-bold uppercase tracking-widest mb-1">Balance Corriente</p>
                      <p className="text-2xl font-black text-slate-900">${s.balance.toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
};

export default App;
