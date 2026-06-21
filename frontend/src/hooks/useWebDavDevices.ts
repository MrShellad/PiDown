import { useState, useCallback, useEffect } from "react";
import {
  getWebDavDevices,
  saveWebDavDevice,
  deleteWebDavDevice,
  testWebDavConnection,
  refreshWebDavDeviceStatus,
} from "@/core/bridge/tauri-commands";
import type { WebDavDevice, SaveWebDavDeviceInput } from "@/core/bridge/tauri-commands";

export function useWebDavDevices() {
  const [devices, setDevices] = useState<WebDavDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deviceRefreshing, setDeviceRefreshing] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const refreshDeviceStatus = useCallback(async (id: string) => {
    setDeviceRefreshing((prev) => ({ ...prev, [id]: true }));
    try {
      const updated = await refreshWebDavDeviceStatus(id);
      setDevices((prev) =>
        prev.map((d) => (d.id === id ? updated : d))
      );
    } catch (err) {
      console.error(`刷新设备 ${id} 状态失败:`, err);
    } finally {
      setDeviceRefreshing((prev) => ({ ...prev, [id]: false }));
    }
  }, []);

  const fetchDevices = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const data = await getWebDavDevices();
      setDevices(data);
      // Trigger background status check for all loaded devices!
      data.forEach((device) => {
        refreshDeviceStatus(device.id);
      });
    } catch (err) {
      console.error("加载 WebDAV 设备失败:", err);
      setError(typeof err === "string" ? err : String(err) || "加载 WebDAV 设备失败");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshDeviceStatus]);

  const saveDevice = useCallback(async (input: SaveWebDavDeviceInput) => {
    setError(null);
    try {
      await saveWebDavDevice(input);
      await fetchDevices();
    } catch (err) {
      console.error("保存 WebDAV 设备失败:", err);
      setError(typeof err === "string" ? err : String(err) || "保存 WebDAV 设备失败");
      throw err;
    }
  }, [fetchDevices]);

  const deleteDevice = useCallback(async (id: string) => {
    setError(null);
    try {
      await deleteWebDavDevice(id);
      await fetchDevices();
    } catch (err) {
      console.error("删除 WebDAV 设备失败:", err);
      setError(typeof err === "string" ? err : String(err) || "删除 WebDAV 设备失败");
      throw err;
    }
  }, [fetchDevices]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  return {
    devices,
    loading,
    refreshing,
    deviceRefreshing,
    error,
    fetchDevices,
    refreshDeviceStatus,
    saveDevice,
    deleteDevice,
    testWebDavConnection
  };
}
