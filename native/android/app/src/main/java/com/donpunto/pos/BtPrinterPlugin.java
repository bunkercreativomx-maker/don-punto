package com.donpunto.pos;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.os.Build;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.OutputStream;
import java.util.Set;
import java.util.UUID;

/**
 * Puente Bluetooth clásico (SPP/RFCOMM) para impresoras térmicas, igual que las apps nativas de POS.
 *  list()  -> impresoras emparejadas en Android
 *  print({address, data(base64)}) -> abre socket, escribe, cierra
 */
@CapacitorPlugin(
    name = "BtPrinter",
    permissions = {
        @Permission(alias = "bt", strings = { Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN }),
        @Permission(alias = "btLegacy", strings = { Manifest.permission.BLUETOOTH, Manifest.permission.BLUETOOTH_ADMIN })
    }
)
public class BtPrinterPlugin extends Plugin {
    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    private String alias() { return Build.VERSION.SDK_INT >= 31 ? "bt" : "btLegacy"; }

    private boolean granted() {
        if (Build.VERSION.SDK_INT < 31) return true; // antes de Android 12 son permisos normales (manifest)
        return getPermissionState("bt") == PermissionState.GRANTED;
    }

    @PluginMethod
    public void list(PluginCall call) {
        if (!granted()) { requestPermissionForAlias(alias(), call, "afterPerm"); return; }
        doList(call);
    }

    @PermissionCallback
    private void afterPerm(PluginCall call) {
        if (!granted()) { call.reject("Sin permiso de Bluetooth. Actívalo en Ajustes → Apps → Don Punto → Permisos → Dispositivos cercanos."); return; }
        if ("print".equals(call.getMethodName())) doPrint(call); else doList(call);
    }

    private void doList(PluginCall call) {
        try {
            BluetoothAdapter ad = BluetoothAdapter.getDefaultAdapter();
            JSObject ret = new JSObject();
            JSArray arr = new JSArray();
            if (ad == null) { ret.put("supported", false); ret.put("devices", arr); call.resolve(ret); return; }
            ret.put("supported", true);
            ret.put("enabled", ad.isEnabled());
            if (ad.isEnabled()) {
                Set<BluetoothDevice> bonded = ad.getBondedDevices();
                for (BluetoothDevice d : bonded) {
                    JSObject o = new JSObject();
                    o.put("name", d.getName() == null ? d.getAddress() : d.getName());
                    o.put("address", d.getAddress());
                    int cls = d.getBluetoothClass() != null ? d.getBluetoothClass().getMajorDeviceClass() : 0;
                    o.put("major", cls); // 0x0600 = IMAGING (impresoras); muchas genéricas reportan 0x1F00 (UNCATEGORIZED)
                    arr.put(o);
                }
            }
            ret.put("devices", arr);
            call.resolve(ret);
        } catch (SecurityException e) {
            call.reject("Sin permiso de Bluetooth: " + e.getMessage());
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void print(PluginCall call) {
        if (!granted()) { requestPermissionForAlias(alias(), call, "afterPerm"); return; }
        doPrint(call);
    }

    private void doPrint(PluginCall call) {
        final String address = call.getString("address");
        final String b64 = call.getString("data");
        if (address == null || b64 == null) { call.reject("Faltan address/data"); return; }
        final byte[] data = Base64.decode(b64, Base64.DEFAULT);
        new Thread(() -> {
            BluetoothSocket sock = null;
            try {
                BluetoothAdapter ad = BluetoothAdapter.getDefaultAdapter();
                if (ad == null || !ad.isEnabled()) throw new Exception("El Bluetooth del equipo está apagado.");
                BluetoothDevice dev = ad.getRemoteDevice(address);
                ad.cancelDiscovery();
                try {
                    sock = dev.createRfcommSocketToServiceRecord(SPP);
                    sock.connect();
                } catch (Exception first) {
                    try { if (sock != null) sock.close(); } catch (Exception ignored) {}
                    try {
                        // Algunas térmicas genéricas solo aceptan conexión "insegura" (sin cifrado)
                        sock = dev.createInsecureRfcommSocketToServiceRecord(SPP);
                        sock.connect();
                    } catch (Exception second) {
                        // Respaldo clásico para módulos BT baratos que no publican el servicio SPP
                        try { if (sock != null) sock.close(); } catch (Exception ignored) {}
                        sock = (BluetoothSocket) dev.getClass().getMethod("createRfcommSocket", int.class).invoke(dev, 1);
                        sock.connect();
                    }
                }
                // Muchas térmicas pitan al conectar y tiran lo que llega en los primeros ms: esperar a que estén listas
                Thread.sleep(600);
                OutputStream out = sock.getOutputStream();
                int chunk = 256;
                for (int i = 0; i < data.length; i += chunk) {
                    out.write(data, i, Math.min(chunk, data.length - i));
                    out.flush();
                    Thread.sleep(30); // ~8 KB/s: más lento que lo que imprime una térmica, no se desborda su búfer
                }
                out.flush();
                // No cerrar antes de que la impresora procese lo último (cerrar pronto = pitido sin papel)
                Thread.sleep(2500);
                JSObject ret = new JSObject();
                ret.put("bytes", data.length);
                call.resolve(ret);
            } catch (Exception e) {
                String m = e.getMessage() == null ? e.toString() : e.getMessage();
                if (m.contains("read failed") || m.contains("socket might closed") || m.contains("timeout"))
                    m = "No se pudo conectar con la impresora. Revisa que esté prendida, cerca y sin otra app usándola (cierra Loyverse u otra app de impresión).";
                call.reject(m);
            } finally {
                try { if (sock != null) sock.close(); } catch (Exception ignored) {}
            }
        }).start();
    }
}
