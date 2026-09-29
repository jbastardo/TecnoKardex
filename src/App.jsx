import { useState, useRef, useEffect, useCallback } from 'react';
import { ScanLine, Trash2, Package, ListChecks, MapPin, Camera, X, Plus, CheckCircle2, Download, Type } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import Tesseract from 'tesseract.js';
import * as XLSX from 'xlsx';
import './index.css';

function App() {
  const [items, setItems] = useState([]);
  const [activeItem, setActiveItem] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [location, setLocation] = useState('Almacén Principal');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  
  const inputRef = useRef(null);
  const ocrInputRef = useRef(null);
  const html5QrCodeRef = useRef(null);

  useEffect(() => {
    if (inputRef.current && !isCameraActive && !isOcrLoading) {
      inputRef.current.focus();
    }
  }, [isCameraActive, activeItem, isOcrLoading]);

  const handleScannedCode = useCallback((newCode) => {
    setItems((prevItems) => {
      let activeItemEnCierre = null;
      setItems(currentItems => {
        return currentItems;
      });

      setActiveItem((currentActive) => {
        activeItemEnCierre = currentActive;
        return currentActive;
      });

      if (activeItemEnCierre && activeItemEnCierre.code === newCode) {
        return prevItems;
      }

      if (!activeItemEnCierre) {
        let existingSku = prevItems.find(item => item.code === newCode && item.location === location);
        
        if (existingSku) {
          setActiveItem(existingSku);
          return prevItems;
        } else {
          const newItem = {
            id: Date.now().toString() + Math.random().toString(),
            code: newCode,
            qty: 0,
            location: location,
            serials: [],
            timestamp: new Date().toISOString(),
          };
          setActiveItem(newItem);
          return [newItem, ...prevItems];
        }
      } else {
        const isDuplicate = prevItems.some(item => item.serials.includes(newCode));
        
        if (isDuplicate) {
          if (!isCameraActive) {
            alert(`⚠️ El serial "${newCode}" ya fue contado previamente.`);
          }
          return prevItems;
        }

        return prevItems.map(item => {
          if (item.id === activeItemEnCierre.id) {
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
      }
    });
  }, [location, isCameraActive]);

  useEffect(() => {
    if (isCameraActive) {
      html5QrCodeRef.current = new Html5Qrcode("reader");
      
      html5QrCodeRef.current.start(
        { facingMode: "environment" },
        {
          fps: 15,
          qrbox: { width: 300, height: 100 },
          aspectRatio: 1.777778
        },
        (decodedText) => {
          handleScannedCode(decodedText);
          if (navigator.vibrate) navigator.vibrate(100);
        },
        (errorMessage) => {
        }
      ).catch((err) => {
        console.error("Error al iniciar la cámara: ", err);
        alert("No se pudo iniciar la cámara. Revisa los permisos.");
        setIsCameraActive(false);
      });
    } else {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.stop().then(() => {
          html5QrCodeRef.current.clear();
          html5QrCodeRef.current = null;
        }).catch(err => console.error(err));
      }
    }

    return () => {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.stop().then(() => html5QrCodeRef.current.clear()).catch(e => console.error(e));
      }
    };
  }, [isCameraActive, handleScannedCode]);

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

  const handleOcrCapture = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsOcrLoading(true);
    
    // Si la cámara estaba activa, la pausamos para ahorrar recursos
    setIsCameraActive(false);

    Tesseract.recognize(
      file,
      'eng', // Para seriales alfanuméricos el inglés es más preciso
      { logger: m => console.log(m) }
    ).then(({ data: { text } }) => {
      setIsOcrLoading(false);
      
      // Intentar adivinar cuál es el serial de Hikvision (L + 8 dígitos)
      const hikvisionMatch = text.match(/L\d{8}/i);
      
      // Buscar también la palabra que esté después de "Serial No." o "SN"
      let guess = '';
      if (hikvisionMatch) {
        guess = hikvisionMatch[0].toUpperCase();
      } else {
        // Limpiar el texto y buscar palabras de 6 a 20 caracteres alfanuméricos
        const words = text.split(/\s+/).filter(w => /^[A-Za-z0-9]{6,20}$/.test(w));
        if (words.length > 0) {
           // Tomamos la última palabra larga (suele ser el serial al final de la etiqueta)
           guess = words[words.length - 1].toUpperCase();
        }
      }
      
      // Limpiamos el texto crudo para mostrarlo más amigable
      const cleanText = text.replace(/\n\s*\n/g, '\n').trim();
      
      const promptText = `IA detectó este texto en la foto:\n\n${cleanText}\n\nCorrige o confirma el Serial abajo:`;
      const userInput = prompt(promptText, guess);
      
      if (userInput && userInput.trim() !== '') {
        handleScannedCode(userInput.trim().toUpperCase());
      }
      
    }).catch(err => {
      setIsOcrLoading(false);
      alert('Error al leer la imagen. Intenta tomar la foto más de cerca.');
      console.error(err);
    });
    
    // Resetear el input para poder tomar la misma foto de nuevo si hace falta
    e.target.value = null;
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1>TecnoKardex</h1>
        <p>Control de inventario profesional</p>
      </header>

      {/* Input oculto para la cámara OCR nativa */}
      <input 
        type="file" 
        accept="image/*" 
        capture="environment" 
        ref={ocrInputRef} 
        style={{ display: 'none' }} 
        onChange={handleOcrCapture} 
      />

      {/* Overlay de carga OCR */}
      {isOcrLoading && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
          <Type size={48} className="spin-animation" style={{ marginBottom: '1rem', color: 'var(--accent)' }} />
          <h2>Analizando texto con IA...</h2>
          <p>Extrayendo serial de la foto</p>
        </div>
      )}

      <section className="glass-panel" style={{ border: activeItem ? '2px solid var(--accent)' : '1px solid rgba(255, 255, 255, 0.1)' }}>
        
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

          <div style={{ display: 'flex', gap: '0.5rem', marginLeft: '1rem' }}>
            <button 
              onClick={() => ocrInputRef.current?.click()}
              className="btn-icon" 
              style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#10b981' }}
              title="Tomar foto y extraer texto (OCR)"
            >
              <Type size={20} />
            </button>
            <button 
              onClick={() => setIsCameraActive(!isCameraActive)}
              className="btn-icon" 
              style={{ 
                background: isCameraActive ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)', 
                color: isCameraActive ? 'var(--danger)' : '#93c5fd'
              }}
            >
              {isCameraActive ? <X size={20} /> : <Camera size={20} />}
            </button>
          </div>
        </div>

        <div className="input-group" style={{ marginBottom: '1rem' }}>
          
          {isCameraActive ? (
            <div style={{ 
              borderRadius: '0.75rem', 
              overflow: 'hidden', 
              border: '2px solid var(--accent)', 
              background: '#000'
            }}>
              <div id="reader" style={{ width: '100%', minHeight: '200px' }}></div>
              
              <div style={{ padding: '0.5rem', textAlign: 'center', color: 'white', background: '#0f172a'}}>
                <small style={{ fontWeight: 'bold' }}>{activeItem ? 'Apunta al SERIAL (centrado en el cuadro)' : 'Apunta al SKU (centrado en el cuadro)'}</small>
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

        {/* Botón de Ayuda OCR si la cámara está activa y falla */}
        {isCameraActive && (
          <button 
            onClick={() => ocrInputRef.current?.click()} 
            style={{ 
              width: '100%', 
              background: 'rgba(16, 185, 129, 0.1)', 
              color: '#10b981', 
              border: '1px solid rgba(16, 185, 129, 0.3)', 
              padding: '0.75rem', 
              borderRadius: '0.5rem', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              gap: '0.5rem', 
              fontWeight: 'bold',
              marginBottom: '1rem',
              cursor: 'pointer'
            }}
          >
            <Type size={18} /> ¿No lee la barra? Tomar foto al texto (OCR)
          </button>
        )}

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

      <style dangerouslySetInnerHTML={{__html: `
        .spin-animation {
          animation: spin 2s linear infinite;
        }
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
      `}} />
    </div>
  );
}

export default App;
