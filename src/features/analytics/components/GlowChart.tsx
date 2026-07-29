import React from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useBrandAccent } from '../../../hooks/useBrandAccent';
import { useTheme } from '../../../contexts/ThemeContext';

const data = [
  { name: 'Seg', leads: 4000, conv: 2400 },
  { name: 'Ter', leads: 3000, conv: 1398 },
  { name: 'Qua', leads: 2000, conv: 9800 },
  { name: 'Qui', leads: 2780, conv: 3908 },
  { name: 'Sex', leads: 1890, conv: 4800 },
  { name: 'Sáb', leads: 2390, conv: 3800 },
  { name: 'Dom', leads: 3490, conv: 4300 },
];

export function GlowChart() {
  const { isAtlas } = useBrandAccent();
  const { theme } = useTheme();
  
  const strokeColor = isAtlas ? '#FF5618' : '#0088CC';
  const fillColor = isAtlas ? '#FF5618' : '#0088CC';

  return (
    <div className="w-full h-72 bg-white/[0.02] border border-white/10 rounded-2xl p-6 relative group overflow-hidden shadow-2xl">
      {/* Background Glow Effect */}
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] rounded-full blur-[80px] opacity-20 transition-all duration-1000 ${isAtlas ? 'bg-atlas-orange' : 'bg-totaltrack-blue'} group-hover:opacity-40`} />
      
      <div className="relative z-10 w-full h-full">
        <div className="mb-4">
          <h3 className={`text-lg font-bold ${theme === 'light' ? 'text-slate-800' : 'text-white'}`}>Volume de Leads (Ao Vivo)</h3>
          <p className="text-sm text-gray-500">Métricas em tempo real processadas pela IA.</p>
        </div>
        
        <div className="w-full h-[80%]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="colorGlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={fillColor} stopOpacity={0.8}/>
                  <stop offset="95%" stopColor={fillColor} stopOpacity={0}/>
                </linearGradient>
                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="5" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>
              <XAxis dataKey="name" stroke={theme === 'light' ? '#cbd5e1' : '#475569'} fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke={theme === 'light' ? '#cbd5e1' : '#475569'} fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: theme === 'light' ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.8)', 
                  backdropFilter: 'blur(10px)', 
                  borderRadius: '12px', 
                  border: '1px solid rgba(255,255,255,0.1)' 
                }} 
              />
              <Area 
                type="monotone" 
                dataKey="conv" 
                stroke={strokeColor} 
                strokeWidth={4} 
                fillOpacity={1} 
                fill="url(#colorGlow)" 
                filter="url(#glow)"
                animationDuration={2000}
                animationEasing="ease-in-out"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
