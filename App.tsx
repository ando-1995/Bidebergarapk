
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Navigation, Settings, Undo, Trash2, Save, X, Layers, 
  Check, Keyboard, Hash, Map as MapIcon, Loader2, Lock, 
  RefreshCcw, Copy, AlertCircle, Database
} from 'lucide-react';
import { PKResult, Waypoint } from './types';
import { calculatePK, getDistance, getCoordsFromPK } from './utils/geoUtils';
import { getLocationContext } from './services/geminiService';
import { AP1_INITIAL_WAYPOINTS, AP636_INITIAL_WAYPOINTS, ROADS } from './constants';
import L from 'leaflet';

const App: React.FC = () => {
  const [view, setView] = useState<'home' | 'settings'>('home');
  const [currentRoadId, setCurrentRoadId] = useState<string>(() => {
    return localStorage.getItem('last_active_road') || 'ap1';
  });
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [password, setPassword] = useState<string>('');
  
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPK, setCurrentPK] = useState<PKResult | null>(null);
  const [locationContext, setLocationContext] = useState<string | null>(null);
  const [lastUpdateSeconds, setLastUpdateSeconds] = useState<number>(0);
  
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualPKValue, setManualPKValue] = useState('');

  const [mapLayer, setMapLayer] = useState<'streets' | 'satellite'>('streets');
  const [activeWaypoints, setActiveWaypoints] = useState<Waypoint[]>([]);

  // Cargar puntos al cambiar de carretera
  useEffect(() => {
    const saved = localStorage.getItem(`custom_road_trace_${currentRoadId}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setActiveWaypoints(parsed);
          return;
        }
      } catch (e) { console.error("Error al cargar trazado local", e); }
    }
    // Si no hay guardado, cargar iniciales
    const initial = currentRoadId === 'ap1' ? AP1_INITIAL_WAYPOINTS : AP636_INITIAL_WAYPOINTS;
    setActiveWaypoints([...initial]);
    localStorage.setItem('last_active_road', currentRoadId);
    
    // Resetear PK actual al cambiar de vía para evitar confusiones
    setCurrentPK(null);
    setLocationContext(null);
  }, [currentRoadId]);

  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);
  const [editPKValue, setEditPKValue] = useState<string>('');

  const homeMapRef = useRef<L.Map | null>(null);
  const homeMapContainerRef = useRef<HTMLDivElement>(null);
  const homeMarkersRef = useRef<L.LayerGroup | null>(null);
  const homePolylineRef = useRef<L.Polyline | null>(null);

  const settingsMapRef = useRef<L.Map | null>(null);
  const settingsMapContainerRef = useRef<HTMLDivElement>(null);
  const settingsMarkersRef = useRef<L.LayerGroup | null>(null);
  const settingsPolylineRef = useRef<L.Polyline | null>(null);

  // Configuramos capas de mapa (OSM a color para calles)
  const layersConfig = {
    streets: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
  };

  useEffect(() => {
    const timer = setInterval(() => {
      if (currentPK) setLastUpdateSeconds(Math.floor((Date.now() - currentPK.timestamp) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [currentPK]);

  // Manejo del mapa en la vista HOME
  useEffect(() => {
    if (view !== 'home' || !homeMapContainerRef.current) return;

    if (!homeMapRef.current) {
      const map = L.map(homeMapContainerRef.current, { zoomControl: false, attributionControl: false }).setView([43.0, -2.5], 10);
      L.tileLayer(layersConfig[mapLayer], { maxZoom: 19 }).addTo(map);
      homeMapRef.current = map;
      homeMarkersRef.current = L.layerGroup().addTo(map);
    } else {
      homeMapRef.current.eachLayer((l) => { if (l instanceof L.TileLayer) homeMapRef.current?.removeLayer(l); });
      L.tileLayer(layersConfig[mapLayer], { maxZoom: 19 }).addTo(homeMapRef.current);
    }

    if (homePolylineRef.current) homeMapRef.current.removeLayer(homePolylineRef.current);
    const coords = activeWaypoints.map(w => [w.lat, w.lng] as [number, number]);
    if (coords.length > 1) {
      homePolylineRef.current = L.polyline(coords, { color: '#3b82f6', weight: 4, opacity: 0.7 }).addTo(homeMapRef.current);
      homeMapRef.current.fitBounds(homePolylineRef.current.getBounds(), { padding: [40, 40] });
    }

    return () => { if (view !== 'home' && homeMapRef.current) { homeMapRef.current.remove(); homeMapRef.current = null; } };
  }, [view, activeWaypoints, mapLayer]);

  useEffect(() => {
    if (!homeMapRef.current || !homeMarkersRef.current || !currentPK) return;
    homeMarkersRef.current.clearLayers();
    L.circleMarker([currentPK.lat, currentPK.lng], { radius: 10, fillColor: '#10b981', color: 'white', weight: 3, fillOpacity: 1 })
      .addTo(homeMarkersRef.current)
      .bindTooltip(`PK ${currentPK.pk.toFixed(3)}`, { permanent: true, direction: 'top', className: 'main-pk-tooltip' });
    homeMapRef.current.setView([currentPK.lat, currentPK.lng], 16);
  }, [currentPK]);

  // Manejo del mapa en la vista INGENIERÍA
  useEffect(() => {
    if (view !== 'settings' || !isAuthenticated || !settingsMapContainerRef.current) return;
    
    const timer = setTimeout(() => {
      if (!settingsMapContainerRef.current) return;
      const map = L.map(settingsMapContainerRef.current, { zoomControl: false, attributionControl: false }).setView([43.0, -2.5], 12);
      L.tileLayer(layersConfig[mapLayer], { maxZoom: 19 }).addTo(map);
      settingsMapRef.current = map;
      settingsMarkersRef.current = L.layerGroup().addTo(map);
      map.invalidateSize();

      map.on('click', (e: L.LeafletMouseEvent) => {
        setActiveWaypoints(prev => [...prev, { lat: e.latlng.lat, lng: e.latlng.lng, pk: 0, isFixed: false }]);
        setSelectedPointIndex(null);
      });
    }, 150);

    return () => { clearTimeout(timer); if (settingsMapRef.current) { settingsMapRef.current.remove(); settingsMapRef.current = null; } };
  }, [view, isAuthenticated, mapLayer]);

  useEffect(() => {
    if (view !== 'settings' || !settingsMapRef.current || !settingsMarkersRef.current) return;
    const map = settingsMapRef.current;
    if (settingsPolylineRef.current) map.removeLayer(settingsPolylineRef.current);
    const coords = activeWaypoints.map(w => [w.lat, w.lng] as [number, number]);
    if (coords.length > 1) settingsPolylineRef.current = L.polyline(coords, { color: '#2563eb', weight: 5, opacity: 0.8 }).addTo(map);

    settingsMarkersRef.current.clearLayers();
    activeWaypoints.forEach((wp, idx) => {
      const isSelected = selectedPointIndex === idx;
      const marker = L.circleMarker([wp.lat, wp.lng], {
        radius: wp.isFixed ? 9 : 6,
        fillColor: isSelected ? '#10b981' : (wp.isFixed ? '#2563eb' : '#64748b'),
        color: 'white', weight: isSelected ? 4 : 2, fillOpacity: 1
      });
      marker.on('click', (e) => { L.DomEvent.stopPropagation(e); setSelectedPointIndex(idx); setEditPKValue(wp.pk ? wp.pk.toString() : ''); });
      if (wp.isFixed) marker.bindTooltip(`PK ${wp.pk.toFixed(2)}`, { permanent: true, direction: 'top', className: 'pk-tooltip-fixed' });
      marker.addTo(settingsMarkersRef.current!);
    });
  }, [activeWaypoints, view, selectedPointIndex, isAuthenticated]);

  const calibrateGlobal = () => {
    const fixedIndices = activeWaypoints.map((w, i) => (w.isFixed ? i : -1)).filter(i => i !== -1);
    if (fixedIndices.length < 2) { alert("Fija el PK en al menos 2 puntos (ej: inicio y final del tramo)."); return; }
    
    const newWaypoints = [...activeWaypoints];
    
    // 1. INTERPOLACIÓN (Entre puntos fijos)
    for (let f = 0; f < fixedIndices.length - 1; f++) {
      const idxStart = fixedIndices[f], idxEnd = fixedIndices[f + 1];
      const pkStart = activeWaypoints[idxStart].pk, pkEnd = activeWaypoints[idxEnd].pk;
      let segmentPathDistances = [0], totalSegmentDist = 0;
      for (let i = idxStart; i < idxEnd; i++) {
        const d = getDistance(activeWaypoints[i].lat, activeWaypoints[i].lng, activeWaypoints[i+1].lat, activeWaypoints[i+1].lng);
        totalSegmentDist += d; segmentPathDistances.push(totalSegmentDist);
      }
      if (totalSegmentDist > 0) {
        for (let i = idxStart + 1; i < idxEnd; i++) {
          const pkValue = pkStart + (segmentPathDistances[i - idxStart] / totalSegmentDist) * (pkEnd - pkStart);
          newWaypoints[i] = { ...newWaypoints[i], pk: pkValue };
        }
      }
    }

    // 2. EXTRAPOLACIÓN HACIA ATRÁS (Antes del primer punto fijo)
    if (fixedIndices[0] > 0) {
      const idxA = fixedIndices[0], idxB = fixedIndices[1];
      const pkA = newWaypoints[idxA].pk, pkB = newWaypoints[idxB].pk;
      let distAB = 0;
      for (let i = idxA; i < idxB; i++) distAB += getDistance(newWaypoints[i].lat, newWaypoints[i].lng, newWaypoints[i+1].lat, newWaypoints[i+1].lng);
      
      if (distAB > 0) {
        const ratio = (pkB - pkA) / distAB;
        for (let i = idxA - 1; i >= 0; i--) {
          const distToNext = getDistance(newWaypoints[i].lat, newWaypoints[i].lng, newWaypoints[i+1].lat, newWaypoints[i+1].lng);
          newWaypoints[i] = { ...newWaypoints[i], pk: newWaypoints[i+1].pk - (distToNext * ratio) };
        }
      }
    }

    // 3. EXTRAPOLACIÓN HACIA ADELANTE (Después del último punto fijo)
    const lastFixedIdx = fixedIndices[fixedIndices.length - 1];
    if (lastFixedIdx < newWaypoints.length - 1) {
      const idxA = fixedIndices[fixedIndices.length - 2], idxB = lastFixedIdx;
      const pkA = newWaypoints[idxA].pk, pkB = newWaypoints[idxB].pk;
      let distAB = 0;
      for (let i = idxA; i < idxB; i++) distAB += getDistance(newWaypoints[i].lat, newWaypoints[i].lng, newWaypoints[i+1].lat, newWaypoints[i+1].lng);
      
      if (distAB > 0) {
        const ratio = (pkB - pkA) / distAB;
        for (let i = idxB + 1; i < newWaypoints.length; i++) {
          const distFromPrev = getDistance(newWaypoints[i-1].lat, newWaypoints[i-1].lng, newWaypoints[i].lat, newWaypoints[i].lng);
          newWaypoints[i] = { ...newWaypoints[i], pk: newWaypoints[i-1].pk + (distFromPrev * ratio) };
        }
      }
    }

    setActiveWaypoints(newWaypoints);
    alert("¡Calibrado completo! Se ha ajustado todo el trazado (incluyendo extremos).");
  };

  const exportForConstants = () => {
    const code = `export const ${currentRoadId.toUpperCase()}_WAYPOINTS: Waypoint[] = ${JSON.stringify(activeWaypoints, null, 2)};`;
    navigator.clipboard.writeText(code).then(() => alert("Código copiado al portapapeles. Pégalo en constants.ts para guardar permanentemente."));
  };

  const getLocation = useCallback(() => {
    if (activeWaypoints.length < 2) { 
      setError("No hay carretera trazada. Ve a ajustes para configurar la vía.");
      return; 
    }
    
    setLoading(true); 
    setError(null);
    setLocationContext("Obteniendo señal GPS...");

    const geoOptions: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    };

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const result = calculatePK(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, activeWaypoints);
          setCurrentPK(result);
          
          const roadName = ROADS.find(r => r.id === currentRoadId)?.name || 'Vía';
          setLocationContext("Analizando el entorno...");
          
          const context = await getLocationContext(result.lat, result.lng, result.pk, roadName);
          if (context) setLocationContext(context);
        } catch (err) {
          console.error("Error al calcular PK:", err);
          setError("Error al procesar la ubicación en el trazado.");
        } finally {
          setLoading(false);
        }
      },
      (err) => { 
        setLoading(false); 
        const messages: Record<number, string> = {
          1: "Permiso de ubicación denegado.",
          2: "No se pudo obtener la ubicación GPS.",
          3: "Tiempo de espera agotado."
        };
        setError(messages[err.code] || "Error GPS: " + err.message);
        setLocationContext(null);
      },
      geoOptions
    );
  }, [activeWaypoints, currentRoadId]);

  const handleManualPKSearch = () => {
    const val = parseFloat(manualPKValue);
    if (isNaN(val)) return;
    const coords = getCoordsFromPK(val, activeWaypoints);
    if (coords) {
      setCurrentPK({ pk: val, accuracy: 0, timestamp: Date.now(), ...coords, distanceToRoad: 0 });
      setIsManualModalOpen(false);
      setManualPKValue('');
      const roadName = ROADS.find(r => r.id === currentRoadId)?.name || 'Vía';
      getLocationContext(coords.lat, coords.lng, val, roadName).then(ctx => {
        if (ctx) setLocationContext(ctx);
      });
    } else { alert("PK fuera de rango del trazado actual."); }
  };

  const renderHome = () => {
    const currentRoadName = ROADS.find(r => r.id === currentRoadId)?.name || 'Vía Desconocida';
    
    return (
    <div className="flex flex-col h-screen bg-[#0B1221] text-white selection:bg-blue-500/30 overflow-hidden">
      {/* Header Original */}
      <div className="p-6 flex justify-between items-center shrink-0 border-b border-white/5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-xl overflow-hidden p-0.5 flex-shrink-0">
            <img 
              src="https://www.google.com/s2/favicons?domain=bidelan.eus&sz=128" 
              alt="Bidelan" 
              className="w-full h-full object-contain" 
              referrerPolicy="no-referrer" 
            />
          </div>
          <div className="flex flex-col justify-center">
            <h1 className="font-black uppercase tracking-tighter text-base leading-none text-white mb-0.5">
              bidebergara<span className="text-blue-500">PK</span>
            </h1>
            <span className="text-[10px] text-blue-400 font-bold uppercase tracking-[0.2em]">{currentRoadName}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <select 
            value={currentRoadId} 
            onChange={(e) => setCurrentRoadId(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[10px] font-bold uppercase outline-none text-slate-300 hover:bg-white/10 transition-colors"
          >
            {ROADS.map(r => <option key={r.id} value={r.id} className="bg-[#0B1221]">{r.name}</option>)}
          </select>
          <button onClick={() => setView('settings')} className="p-3 bg-white/5 rounded-2xl border border-white/10 hover:bg-white/10 transition-all active:scale-95 shadow-lg"><Settings className="w-6 h-6 text-slate-300" /></button>
        </div>
      </div>

      <div className="flex-1 flex flex-col px-6 overflow-y-auto scrollbar-hide py-4">
        {activeWaypoints.length < 2 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center max-w-xs mx-auto space-y-8">
            <AlertCircle className="w-20 h-20 text-blue-500 animate-pulse" />
            <h2 className="text-2xl font-black uppercase">Vía no configurada</h2>
            <p className="text-slate-400 text-sm">Entra en Ingeniería para trazar la carretera y fijar los PKs de referencia.</p>
            <button onClick={() => setView('settings')} className="w-full bg-blue-600 py-5 rounded-[2rem] font-black uppercase text-sm">Configurar ahora</button>
          </div>
        ) : (
          <div className="flex flex-col h-full gap-4 pb-8">
            {/* Display PK con más aire vertical */}
            <div className="flex flex-col items-center justify-center py-8 shrink-0">
              <p className="text-[11px] font-bold text-slate-500 tracking-widest uppercase mb-1">Punto Kilométrico</p>
              <div className="flex items-start">
                <span className="text-[110px] font-black leading-none text-white tabular-nums drop-shadow-2xl">
                  {currentPK ? Math.floor(currentPK.pk) : "---"}
                </span>
                <span className="text-4xl font-black text-blue-500 mt-4 ml-1">
                  .{currentPK ? (currentPK.pk % 1).toFixed(3).split('.')[1] : "---"}
                </span>
              </div>
            </div>

            {/* Módulo de Contexto original */}
            <div className="w-full bg-[#1C2436] rounded-[2rem] p-5 border border-white/5 flex items-center gap-4 shrink-0 shadow-lg">
              <div className="w-10 h-10 bg-blue-500/10 rounded-full flex items-center justify-center shrink-0">
                <Navigation className="w-5 h-5 text-blue-500 rotate-180" />
              </div>
              <div className="flex flex-col">
                <p className={`text-[11px] font-semibold uppercase leading-snug ${error ? 'text-rose-500' : 'text-slate-300'}`}>
                  {error || locationContext || 'Activa el GPS para identificar tu ubicación exacta...'}
                </p>
                <div className="flex gap-2">
                  {currentPK && currentPK.distanceToRoad > 50 && currentPK.accuracy > 0 && (
                    <p className="text-[9px] font-black text-rose-500 uppercase mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> Fuera de calzada (+{Math.round(currentPK.distanceToRoad)}m)
                    </p>
                  )}
                  {currentPK && currentPK.accuracy > 0 && (
                    <p className="text-[9px] font-bold text-slate-500 uppercase mt-0.5">
                      Precisión: ±{Math.round(currentPK.accuracy)}m
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Mapa ocupando el espacio restante disponible */}
            <div className="flex-1 w-full bg-[#1C2436] rounded-[2rem] relative overflow-hidden border border-white/5 shadow-2xl min-h-[220px]">
              <div ref={homeMapContainerRef} className="absolute inset-0" />
              <button 
                onClick={() => setMapLayer(l => l === 'streets' ? 'satellite' : 'streets')} 
                className="absolute top-4 right-4 z-10 p-2 bg-black/50 backdrop-blur-md rounded-lg text-white border border-white/10"
              >
                <Layers className="w-5 h-5" />
              </button>
            </div>

            {/* Botones de acción inferiores */}
            <div className="w-full flex flex-col gap-3 pt-2 shrink-0">
              <button 
                onClick={getLocation} 
                disabled={loading} 
                className={`w-full py-6 rounded-[2rem] flex items-center justify-center gap-4 shadow-xl active:scale-95 transition-all ${loading ? 'bg-slate-700 cursor-not-allowed' : 'bg-blue-600'}`}
              >
                {loading ? <Loader2 className="w-7 h-7 animate-spin" /> : <Navigation className="w-7 h-7 rotate-45" />}
                <span className="font-black text-xl uppercase tracking-tighter">
                  {loading ? 'Localizando...' : 'Obtener mi PK'}
                </span>
              </button>
              <button 
                onClick={() => setIsManualModalOpen(true)} 
                className="w-full bg-white/5 py-4 rounded-2xl flex items-center justify-center gap-3 text-slate-400 text-xs font-bold uppercase tracking-widest hover:bg-white/10"
              >
                <Keyboard className="w-4 h-4" /> Buscar PK Manual
              </button>
            </div>
          </div>
        )}
      </div>

      {isManualModalOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6 bg-[#0B1221]/95 backdrop-blur-sm">
          <div className="bg-[#1C2436] w-full max-w-sm rounded-[3rem] p-8 border border-white/10 animate-in zoom-in-95">
            <h3 className="font-black uppercase tracking-tighter text-xl mb-6 flex items-center gap-2"><Hash className="text-blue-500"/> Buscador</h3>
            <input type="number" value={manualPKValue} onChange={(e) => setManualPKValue(e.target.value)} className="w-full bg-[#0B1221] border-2 border-white/5 rounded-[2rem] p-8 text-5xl font-black text-center mb-6 focus:border-blue-500 outline-none" placeholder="000.0" />
            <div className="flex gap-3">
              <button onClick={() => setIsManualModalOpen(false)} className="flex-1 bg-white/5 py-5 rounded-2xl font-bold uppercase text-xs">Cerrar</button>
              <button onClick={handleManualPKSearch} className="flex-[2] bg-blue-600 py-5 rounded-2xl font-black uppercase text-xs">Ver en mapa</button>
            </div>
          </div>
        </div>
      )}
    </div>
    );
  };

  const renderSettings = () => (
    <div className="h-screen bg-[#0B1221] text-white flex flex-col overflow-hidden">
      <div className="p-6 flex justify-between items-center bg-[#151D2E] border-b border-white/5 shrink-0">
        <div>
          <h2 className="text-lg font-black uppercase flex items-center gap-3"><Database className="w-5 h-5 text-blue-500" /> Ingeniería de Vía</h2>
          <p className="text-[10px] font-bold text-slate-500 uppercase">Trazado y calibración maestra</p>
        </div>
        <button onClick={() => { setView('home'); setIsAuthenticated(false); }} className="p-3 bg-white/5 rounded-2xl"><X /></button>
      </div>

      {!isAuthenticated ? (
        <div className="flex-1 flex flex-col justify-center max-w-xs mx-auto text-center p-6">
          <Lock className="w-16 h-16 mx-auto mb-6 text-blue-500/20" />
          <p className="text-xs font-bold text-slate-500 uppercase mb-6">Acceso restringido (PIN: 4444)</p>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-slate-800 border-2 border-white/10 rounded-2xl py-5 text-center text-4xl font-black mb-4 outline-none" placeholder="••••" />
          <button onClick={() => password === '4444' ? setIsAuthenticated(true) : alert("PIN incorrecto")} className="w-full bg-blue-600 py-6 rounded-2xl font-black uppercase">Desbloquear</button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="relative flex-1 bg-[#111827]">
            <div ref={settingsMapContainerRef} className="absolute inset-0" />
            <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
              <button onClick={() => setMapLayer(l => l === 'streets' ? 'satellite' : 'streets')} className="bg-[#1C2436] p-4 rounded-2xl border border-white/10 shadow-2xl"><Layers className="w-6 h-6 text-slate-300" /></button>
              <button onClick={exportForConstants} className="bg-amber-600 p-4 rounded-2xl border border-white/10 shadow-2xl"><Copy className="w-6 h-6" /></button>
            </div>
            <div className="absolute bottom-6 left-6 z-[1000] pointer-events-none">
                <div className="bg-[#0B1221]/90 backdrop-blur-md p-4 rounded-2xl border border-white/10 text-[10px] font-bold text-slate-400 space-y-1">
                    <p>1. Clic en mapa para añadir puntos.</p>
                    <p>2. Selecciona punto para fijar su PK.</p>
                    <p>3. Calibra para interpolar el resto.</p>
                </div>
            </div>
          </div>

          <div className="bg-[#151D2E] p-6 border-t border-white/5 z-[1001] shrink-0">
            {selectedPointIndex !== null ? (
              <div className="bg-blue-600/10 border-2 border-blue-500/30 p-6 rounded-[2rem] animate-in slide-in-from-bottom">
                <div className="flex justify-between items-center mb-3">
                  <p className="text-[10px] font-black uppercase text-blue-400">Editar PK (Punto {selectedPointIndex + 1})</p>
                  <button onClick={() => {
                    const next = [...activeWaypoints];
                    next[selectedPointIndex] = { ...next[selectedPointIndex], isFixed: !next[selectedPointIndex].isFixed };
                    setActiveWaypoints(next);
                  }} className={`px-3 py-1 rounded-full text-[9px] font-black uppercase border ${activeWaypoints[selectedPointIndex].isFixed ? 'bg-blue-500 border-blue-400 text-white' : 'bg-white/5 border-white/10 text-slate-500'}`}>
                    {activeWaypoints[selectedPointIndex].isFixed ? 'Anclado' : 'Flexible'}
                  </button>
                </div>
                <div className="flex gap-3 mb-5">
                  <input 
                    type="number" 
                    step="0.001" 
                    value={editPKValue} 
                    onChange={(e) => setEditPKValue(e.target.value)} 
                    className="w-full bg-[#0B1221] border-2 border-slate-700 rounded-2xl p-5 text-2xl font-black outline-none focus:border-blue-500" 
                    placeholder="000.00" 
                    autoFocus
                  />
                  <button onClick={() => {
                    const val = parseFloat(editPKValue);
                    if (!isNaN(val)) {
                      const next = [...activeWaypoints];
                      next[selectedPointIndex] = { ...next[selectedPointIndex], pk: val, isFixed: true };
                      setActiveWaypoints(next); setSelectedPointIndex(null);
                    }
                  }} className="bg-blue-600 px-6 rounded-2xl"><Check className="w-8 h-8" /></button>
                </div>
                <div className="flex justify-between items-center">
                    <button onClick={() => setSelectedPointIndex(null)} className="text-xs font-black uppercase text-slate-400">Cancelar</button>
                    <button onClick={() => { setActiveWaypoints(activeWaypoints.filter((_,i) => i !== selectedPointIndex)); setSelectedPointIndex(null); }} className="text-xs font-black uppercase text-rose-500 flex items-center gap-1"><Trash2 className="w-3 h-3" /> Eliminar</button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{activeWaypoints.length} Puntos registrados</p>
                  <button 
                    onClick={() => {
                      const el = document.getElementById('waypoints-list');
                      el?.classList.toggle('hidden');
                    }}
                    className="text-[10px] font-black uppercase text-blue-500 flex items-center gap-1"
                  >
                    <Hash className="w-3 h-3" /> Ver Listado
                  </button>
                  <button 
                    onClick={() => {
                      const code = JSON.stringify(activeWaypoints, null, 2);
                      navigator.clipboard.writeText(code);
                      alert("Código copiado al portapapeles. Pégalo en el chat con el asistente.");
                    }}
                    className="text-[10px] font-black uppercase text-emerald-500 flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" /> Copiar Código
                  </button>
                </div>

                <div id="waypoints-list" className="hidden max-h-48 overflow-y-auto mb-4 space-y-2 border-y border-white/5 py-3 scrollbar-hide">
                  {activeWaypoints.map((wp, idx) => (
                    <div 
                      key={idx} 
                      onClick={() => { setSelectedPointIndex(idx); setEditPKValue(wp.pk.toString()); }}
                      className="flex items-center justify-between bg-white/5 p-3 rounded-xl border border-white/5 active:bg-white/10"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-black text-slate-600">{idx + 1}</span>
                        <div className={`w-2 h-2 rounded-full ${wp.isFixed ? 'bg-blue-500' : 'bg-slate-700'}`} />
                        <span className="text-xs font-bold font-mono">{wp.lat.toFixed(4)}, {wp.lng.toFixed(4)}</span>
                      </div>
                      <span className={`text-xs font-black ${wp.isFixed ? 'text-blue-400' : 'text-slate-500'}`}>PK {wp.pk.toFixed(3)}</span>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3">
                    <button onClick={() => setActiveWaypoints(p => p.slice(0, -1))} className="flex-1 bg-white/5 py-5 rounded-2xl border border-white/5 uppercase text-[10px] font-black text-slate-400 flex items-center justify-center gap-2"><Undo className="w-4 h-4" /> Deshacer</button>
                    <button onClick={() => {
                        const initial = currentRoadId === 'ap1' ? AP1_INITIAL_WAYPOINTS : AP636_INITIAL_WAYPOINTS;
                        if(confirm("¿Restaurar trazado de fábrica? Se perderán los cambios manuales.")) setActiveWaypoints([...initial]);
                    }} className="flex-1 bg-blue-500/10 py-5 rounded-2xl border border-blue-500/10 uppercase text-[10px] font-black text-blue-400 flex items-center justify-center gap-2">
                        <Database className="w-4 h-4" /> Restaurar
                    </button>
                    <button onClick={() => { if(confirm("¿Vaciar todo?")) setActiveWaypoints([]) }} className="flex-1 bg-rose-500/10 py-5 rounded-2xl border border-rose-500/10 uppercase text-[10px] font-black text-rose-400 flex items-center justify-center gap-2"><Trash2 className="w-4 h-4" /> Borrar</button>
                </div>
                <button onClick={calibrateGlobal} className="w-full bg-[#1C2436] border border-blue-500/30 py-6 rounded-2xl flex items-center justify-center gap-3 font-black uppercase text-sm text-blue-400"><RefreshCcw className="w-6 h-6" /> Calibrar Trazado</button>
                <button onClick={() => { localStorage.setItem(`custom_road_trace_${currentRoadId}`, JSON.stringify(activeWaypoints)); setView('home'); }} className="w-full bg-blue-600 py-6 rounded-2xl flex items-center justify-center gap-3 font-black uppercase text-sm shadow-xl"><Save className="w-6 h-6" /> Guardar y Salir</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="h-full w-full bg-[#0B1221] overflow-hidden select-none">
      {view === 'home' ? renderHome() : renderSettings()}
      <style>{`
        .main-pk-tooltip { background: #10b981 !important; color: white !important; border: 3px solid #0B1221 !important; font-weight: 900 !important; border-radius: 12px !important; font-size: 14px !important; padding: 8px 12px !important; box-shadow: 0 10px 25px rgba(0,0,0,0.5) !important; text-transform: uppercase; }
        .pk-tooltip-fixed { background: #2563eb !important; color: white !important; border: 2px solid white !important; font-weight: 800 !important; border-radius: 8px !important; font-size: 10px !important; padding: 4px 8px !important; box-shadow: 0 4px 15px rgba(0,0,0,0.4) !important; }
        .leaflet-container { background: #0b1221 !important; width: 100%; height: 100%; }
        .animate-in { animation: animateIn 0.3s ease-out; }
        @keyframes animateIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
};

export default App;
