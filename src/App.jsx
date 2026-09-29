import { useState, useRef, useEffect } from 'react';
import { ScanLine, Trash2, Package, ListChecks, MapPin, Camera, X, Plus, CheckCircle2, Download } from 'lucide-react';
import { useZxing } from 'react-zxing';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import * as XLSX from 'xlsx';
import './index.css';

function App() {
  const [items, setItems] = useState([]);
  const [activeItem, setActiveItem] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [location, setLocation] = useState('Almacén Principal');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const inputRef = useRef(null);

  const hints = new Map();
  const formats = [
    BarcodeFormat.QR_CODE,
    BarcodeFormat.DATA_MATRIX,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.ITF
  ];
  hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);

  const { ref: videoRef } = useZxing({
    paused: !isCameraActive,
    hints,
    timeBetweenDecodingAttempts: 150,
    constraints: {
      video: {
        facingMode: "environment",
        width: { min: 1280, ideal: 1920 },
        height: { min: 720, ideal: 1080 },
        advanced: [{ focusMode: "continuous" }]
      }
    },
    onDecodeResult(result) {
      const text = result.getText();
      handleScannedCode(text);
      if (navigator.vibrate) navigator.vibrate(200);
    },
  });

  useEffect(() => {
    if (inputRef.current && !isCameraActive) {
      inputRef.current.focus();
    }
  }, [isCameraActive, activeItem]);

  const handleScannedCode = (newCode) => {
    if (!activeItem) {
      let existingSku = items.find(item => item.code === newCode && item.location === location);
      
      if (existingSku) {
        setActiveItem(existingSku);
      } else {
        const newItem = {
          id: Date.now().toString() + Math.random().toString(),
          code: newCode,
          qty: 0,
          location: location,
          serials: [],
          timestamp: new Date().toISOString(),
        };
        setItems(prev => [newItem, ...prev]);
        setActiveItem(newItem);
      }
    } else {
      const isDuplicate = items.some(item => item.serials.includes(newCode));
      
      if (isDuplicate) {
        alert(`⚠️ El serial "${newCode}" ya fue contado previamente.`);
        return;
      }

      setItems(prevItems => {
        return prevItems.map(item => {
          if (item.id === activeItem.id) {
            const updatedItem = {
              ...item,
              qty: item.qty + 1,
              serials: [...item.serials, newCode],
              timestamp: new Date().toISOString()
            };
            setActiveItem(updatedItem);
            return updatedItem;
          }
          return item;
        });
      });
    }
  };

  const handleScan = (e) => {
    if (e.key === 'Enter' && inputValue.trim() !== '') {
      handleScannedCode(inputValue.trim());
      setInputValue('');
      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
      }, 10);
    }
  };

  const addQuantityWithoutSerial = () => {
    if (!activeItem) return;
    setItems(prevItems => {
      return prevItems.map(item => {
        if (item.id === activeItem.id) {
          const updatedItem = {
            ...item,
            qty: item.qty + 1,
            timestamp: new Date().toISOString()
          };
          setActiveItem(updatedItem);
          return updatedItem;
        }
        return item;
      });
    });
    if (inputRef.current) inputRef.current.focus();
  };

  const removeItem = (id) => {
    setItems((prev) => prev.filter(item => item.id !== id));
    if (activeItem && activeItem.id === id) setActiveItem(null);
    if (inputRef.current && !isCameraActive) inputRef.current.focus();
  };

  const exportToExcel = () => {
    const exportData = [];
    
    items.forEach(item => {
      if (item.serials.length > 0) {
        item.serials.forEach(serial => {
          exportData.push({ Ubicacion: item.location, SKU: item.code, Serial: serial, Cantidad: 1, Fecha: new Date(item.timestamp).toLocaleString() });
        });
      } else {
        exportData.push({ Ubicacion: item.location, SKU: item.code, Serial: "N/A", Cantidad: item.qty, Fecha: new Date(item.timestamp).toLocaleString() });
      }
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventario");
    XLSX.writeFile(workbook, `Conteo_Kardex_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1>TecnoKardex</h1>
        <p>Control de inventario profesional</p>
      </header>

      {/* ZONA DE ESCANEO */}
      <section className="glass-panel" style={{ border: activeItem ? '2px solid var(--accent)' : '1px solid rgba(255, 255, 255, 0.1)' }}>
        
        {/* Cabecera / Ubicación */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          
          {!activeItem ? (
            <div className="input-group" style={{ flex: 1 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <MapPin size={18} /> Ubicación Actual
              </label>
              <input
                type="text"
                className="scanner-input"
                style={{ fontSize: '1rem', padding: '0.5rem', background: 'rgba(15, 23, 42, 0.4)' }}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
          ) : (
             <div style={{ flex: 1, color: 'var(--text-secondary)' }}>
                <small>Modo: Escaneo de Seriales</small>
             </div>
          )}

          <button 
            onClick={() => setIsCameraActive(!isCameraActive)}
            className="btn-icon" 
            style={{ 
              background: isCameraActive ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)', 
              color: isCameraActive ? 'var(--danger)' : '#93c5fd',
              marginLeft: '1rem'
            }}
          >
            {isCameraActive ? <X size={20} /> : <Camera size={20} />}
          </button>
        </div>

        {/* Input Físico / Cámara Horizontal */}
        <div className="input-group" style={{ marginBottom: '1rem' }}>
          
          {isCameraActive ? (
            <div style={{ 
              borderRadius: '0.75rem', 
              overflow: 'hidden', 
              border: '2px solid var(--accent)', 
              position: 'relative',
              height: '140px', // Rectángulo horizontal
              background: '#000'
            }}>
              <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              
              {/* Línea Láser Roja */}
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '10%',
                right: '10%',
                height: '2px',
                background: 'rgba(239, 68, 68, 0.9)',
                boxShadow: '0 0 8px rgba(239, 68, 68, 0.8)',
                transform: 'translateY(-50%)',
                zIndex: 10
              }} />
              
              <div style={{ position: 'absolute', bottom: '6px', width: '100%', textAlign: 'center', color: 'white', textShadow: '0 2px 4px rgba(0,0,0,0.8)', zIndex: 10}}>
                <small style={{ fontWeight: 'bold' }}>{activeItem ? 'Apunta al SERIAL' : 'Apunta al código SKU'}</small>
              </div>
            </div>
          ) : (
            <input
              ref={inputRef}
              type="text"
              className="scanner-input"
              placeholder={activeItem ? "Pistola: Lee el SERIAL aquí..." : "Pistola: Lee el SKU aquí..."}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleScan}
            />
          )}
        </div>

        {/* Info del SKU activo y botón Finalizar */}
        {activeItem && (
          <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '1rem', borderRadius: '0.75rem', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', color: '#93c5fd' }}>SKU: {activeItem.code}</h3>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <span style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Total: {activeItem.qty}</span>
              <button 
                onClick={addQuantityWithoutSerial}
                style={{ background: 'rgba(255, 255, 255, 0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', padding: '0.5rem 1rem', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold' }}>
                <Plus size={18} /> +1 Sin Serial
              </button>
            </div>
            
            <button 
              onClick={() => setActiveItem(null)} 
              style={{ 
                width: '100%', 
                background: '#10b981', 
                color: 'white', 
                border: 'none', 
                padding: '0.75rem', 
                borderRadius: '0.5rem', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                gap: '0.5rem', 
                fontWeight: 'bold',
                fontSize: '1.1rem',
                cursor: 'pointer'
              }}
            >
              <CheckCircle2 size={20} /> Terminar este SKU
            </button>
          </div>
        )}
      </section>

      {/* LISTA DE REGISTROS */}
      <section className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div className="list-header" style={{ marginBottom: '1rem' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ListChecks size={20} /> Resumen
          </h2>
          {items.length > 0 && (
            <button 
              onClick={exportToExcel}
              style={{ background: '#10b981', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold', cursor: 'pointer' }}>
              <Download size={18} /> Excel
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem 0' }}>
            <Package size={48} style={{ opacity: 0.2, margin: '0 auto 1rem' }} />
            <p>Aún no hay lecturas.<br/>Escanea un SKU para empezar.</p>
          </div>
        ) : (
          <div className="item-list" style={{ flex: 1, overflowY: 'auto' }}>
            {items.map((item) => (
              <div key={item.id} className="item-card" style={{ borderLeft: activeItem?.id === item.id ? '4px solid var(--accent)' : 'none' }}>
                <div className="item-details">
                  <span className="item-code" style={{ fontSize: '1.1rem' }}>SKU: {item.code}</span>
                  <span className="item-time" style={{ color: '#93c5fd' }}>
                    <MapPin size={12} style={{ display: 'inline', marginRight: '4px' }}/>{item.location} • {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  
                  {item.serials.length > 0 && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      <strong>Seriales ({item.serials.length}):</strong> {item.serials.slice(-3).join(', ')} {item.serials.length > 3 ? '...' : ''}
                    </div>
                  )}
                </div>
                <div className="item-actions">
                  <span className="qty-badge" style={{ fontSize: '1.2rem', padding: '0.5rem' }}>x{item.qty}</span>
                  <button onClick={() => removeItem(item.id)} className="btn-icon" aria-label="Eliminar">
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default App;
