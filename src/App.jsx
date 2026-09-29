import { useState, useRef, useEffect } from 'react';
import { ScanLine, Trash2, Package, ListChecks, MapPin, Camera, X, Plus, ChevronLeft, Download } from 'lucide-react';
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

  // Configurar pistas para ZXing para asegurar máxima compatibilidad (Barras 1D y QR)
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

  // Cámara Zxing optimizada
  const { ref: videoRef } = useZxing({
    paused: !isCameraActive,
    hints,
    timeBetweenDecodingAttempts: 150, // Escaneo más rápido (150ms)
    onDecodeResult(result) {
      const text = result.getText();
      handleScannedCode(text);
      if (navigator.vibrate) {
        navigator.vibrate(200);
      }
    },
  });

  // Mantener foco en el input físico
  useEffect(() => {
    if (inputRef.current && !isCameraActive) {
      inputRef.current.focus();
    }
  }, [isCameraActive, activeItem]);

  // Manejador central de escaneos
  const handleScannedCode = (newCode) => {
    if (!activeItem) {
      // 1. No hay SKU activo, entonces este código es un SKU nuevo
      let existingSku = items.find(item => item.code === newCode && item.location === location);
      
      if (existingSku) {
        // Ya existía en la lista, lo activamos
        setActiveItem(existingSku);
      } else {
        // No existía, lo creamos
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
      // 2. Ya hay un SKU activo. Este código que entra es un SERIAL.
      
      // Validar que el serial no exista en este SKU ni en ningún otro
      const isDuplicate = items.some(item => item.serials.includes(newCode));
      
      if (isDuplicate) {
        alert(`⚠️ El serial "${newCode}" ya fue contado previamente.`);
        return;
      }

      // Si no es duplicado, lo agregamos al SKU activo
      setItems(prevItems => {
        return prevItems.map(item => {
          if (item.id === activeItem.id) {
            const updatedItem = {
              ...item,
              qty: item.qty + 1,
              serials: [...item.serials, newCode],
              timestamp: new Date().toISOString()
            };
            // Actualizar el estado activo también para que la UI se refresque
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
    if (activeItem && activeItem.id === id) {
      setActiveItem(null);
    }
    if (inputRef.current && !isCameraActive) inputRef.current.focus();
  };

  const exportToExcel = () => {
    // Aplanar los datos para el Excel
    const exportData = [];
    
    items.forEach(item => {
      if (item.serials.length > 0) {
        // Si tiene seriales, exportamos una fila por cada serial
        item.serials.forEach(serial => {
          exportData.push({
            Ubicacion: item.location,
            SKU: item.code,
            Serial: serial,
            Cantidad: 1,
            Fecha: new Date(item.timestamp).toLocaleString()
          });
        });
      } else {
        // Si no tiene seriales, exportamos una fila con la cantidad total
        exportData.push({
          Ubicacion: item.location,
          SKU: item.code,
          Serial: "N/A",
          Cantidad: item.qty,
          Fecha: new Date(item.timestamp).toLocaleString()
        });
      }
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventario");
    
    // Generar archivo
    XLSX.writeFile(workbook, `Conteo_Kardex_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const formatDate = (isoString) => {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1>TecnoKardex</h1>
        <p>Control de inventario profesional</p>
      </header>

      {/* ZONA DE ESCANEO */}
      <section className="glass-panel" style={{ border: activeItem ? '2px solid var(--accent)' : '1px solid rgba(255, 255, 255, 0.1)' }}>
        
        {/* Cabecera de la zona de escaneo */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          
          {activeItem ? (
            <button onClick={() => setActiveItem(null)} className="btn-icon" style={{ background: 'var(--surface-light)', borderRadius: '0.5rem', padding: '0.5rem 1rem', width: 'auto', display: 'flex', gap: '0.5rem' }}>
              <ChevronLeft size={18} /> Volver a SKUs
            </button>
          ) : (
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

        {/* Info del SKU activo */}
        {activeItem && (
          <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '1rem', borderRadius: '0.75rem', marginBottom: '1rem', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', color: '#93c5fd' }}>SKU: {activeItem.code}</h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Total: {activeItem.qty}</span>
              <button 
                onClick={addQuantityWithoutSerial}
                style={{ background: 'var(--accent)', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold' }}>
                <Plus size={18} /> +1 Sin Serial
              </button>
            </div>
          </div>
        )}
        
        {/* Input Físico / Cámara */}
        <div className="input-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ScanLine size={18} /> {activeItem ? 'Escanear SERIAL' : 'Escanear SKU'}
          </label>
          
          {isCameraActive ? (
            <div style={{ borderRadius: '0.75rem', overflow: 'hidden', border: '1px solid var(--accent)', position: 'relative' }}>
              <video ref={videoRef} style={{ width: '100%', display: 'block' }} />
              <div style={{ position: 'absolute', bottom: '10px', width: '100%', textAlign: 'center', color: 'white', textShadow: '0 2px 4px rgba(0,0,0,0.8)'}}>
                <small>{activeItem ? 'Apunta al SERIAL del producto' : 'Apunta al código SKU (producto principal)'}</small>
              </div>
            </div>
          ) : (
            <input
              ref={inputRef}
              type="text"
              className="scanner-input"
              placeholder={activeItem ? "Pistola: Lee el serial aquí..." : "Pistola: Lee el SKU aquí..."}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleScan}
            />
          )}
        </div>
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
                    <MapPin size={12} style={{ display: 'inline', marginRight: '4px' }}/>{item.location} • {formatDate(item.timestamp)}
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
