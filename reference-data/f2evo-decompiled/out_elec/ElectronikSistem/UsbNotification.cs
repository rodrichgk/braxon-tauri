using System;
using System.Runtime.InteropServices;

namespace ElectronikSistem;

public class UsbNotification
{
	private struct DevBroadcastDeviceinterface
	{
		internal int Size;

		internal int DeviceType;

		internal int Reserved;

		internal Guid ClassGuid;

		internal short Name;
	}

	public const int DbtDevicearrival = 32768;

	public const int DbtDeviceremovecomplete = 32772;

	public const int WmDevicechange = 537;

	private const int DbtDevtypDeviceinterface = 5;

	private static readonly Guid GuidDevinterfaceUSBDevice = new Guid("A5DCBF10-6530-11D2-901F-00C04FB951ED");

	private static IntPtr notificationHandle;

	public static void RegisterUsbDeviceNotification(IntPtr windowHandle)
	{
		DevBroadcastDeviceinterface structure = new DevBroadcastDeviceinterface
		{
			DeviceType = 5,
			Reserved = 0,
			ClassGuid = GuidDevinterfaceUSBDevice,
			Name = 0
		};
		structure.Size = Marshal.SizeOf(structure);
		IntPtr intPtr = Marshal.AllocHGlobal(structure.Size);
		Marshal.StructureToPtr(structure, intPtr, fDeleteOld: true);
		notificationHandle = RegisterDeviceNotification(windowHandle, intPtr, 0);
	}

	public static void UnregisterUsbDeviceNotification()
	{
		UnregisterDeviceNotification(notificationHandle);
	}

	[DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
	private static extern IntPtr RegisterDeviceNotification(IntPtr recipient, IntPtr notificationFilter, int flags);

	[DllImport("user32.dll")]
	private static extern bool UnregisterDeviceNotification(IntPtr handle);
}
