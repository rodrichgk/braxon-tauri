using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;

namespace ElectronikSistem;

public class SystemService
{
	private delegate bool EnumThreadDelegate(IntPtr hWnd, IntPtr lParam);

	private const uint WM_KEYDOWN = 256u;

	private const uint WM_SYSCOMMAND = 24u;

	private const uint SC_CLOSE = 83u;

	private const uint WM_GETTEXT = 13u;

	private const uint WM_Click = 245u;

	private const uint WM_LBUTTONDOWN = 513u;

	private const uint WM_LBUTTONUP = 514u;

	private const uint WM_LBUTTONDBLCLK = 515u;

	private const uint WM_RBUTTONDOWN = 516u;

	private const uint WM_RBUTTONUP = 517u;

	private const uint WM_RBUTTONDBLCLK = 518u;

	private const int GWL_STYLE = -16;

	private const uint WS_CHILD = 1073741824u;

	public const string SHIFT = "+";

	public const string CTRL = "^";

	public const string ALT = "%";

	public const string BACKSPACE = "{BACKSPACE}, {BS}, or {BKSP}";

	public const string BREAK = "{BREAK}";

	public const string CAPS = "{CAPSLOCK}";

	public const string DEL = "{DELETE} or {DEL}";

	public const string DOWN_ARROW = "{DOWN}";

	[DllImport("user32.dll")]
	public static extern IntPtr FindWindowEx(IntPtr hwndParent, IntPtr hwndChildAfter, string lpszClass, string lpszWindow);

	[DllImport("user32.dll")]
	public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

	[DllImport("user32.dll")]
	public static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

	[DllImport("user32.dll", CharSet = CharSet.Auto)]
	private static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, int wParam, StringBuilder lParam);

	[DllImport("user32.dll")]
	public static extern IntPtr PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

	[DllImport("user32.dll")]
	private static extern bool PostMessage(IntPtr hWnd, uint Msg, int wParam, int lParam);

	[DllImport("user32.dll")]
	private static extern bool SetForegroundWindow(IntPtr hWnd);

	[DllImport("user32.dll")]
	private static extern bool EnumThreadWindows(int dwThreadId, EnumThreadDelegate lpfn, IntPtr lParam);

	[DllImport("user32.dll")]
	public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

	[DllImport("user32.dll")]
	public static extern int GetWindowLong(IntPtr hWnd, int nIndex);

	[DllImport("user32.dll", SetLastError = true)]
	private static extern IntPtr SetParent(IntPtr hWndChild, IntPtr hWndNewParent);

	private static IEnumerable<IntPtr> EnumerateProcessWindowHandles(int processId)
	{
		List<IntPtr> handles = new List<IntPtr>();
		foreach (ProcessThread thread in Process.GetProcessById(processId).Threads)
		{
			EnumThreadWindows(thread.Id, delegate(IntPtr hWnd, IntPtr lParam)
			{
				handles.Add(hWnd);
				return true;
			}, IntPtr.Zero);
		}
		return handles;
	}

	public static void sendKeystroke(IntPtr handle, string processname, string keys)
	{
		Process[] processesByName = Process.GetProcessesByName(processname);
		IntPtr mainWindowHandle = processesByName[0].MainWindowHandle;
		if (mainWindowHandle != IntPtr.Zero)
		{
			SetForegroundWindow(mainWindowHandle);
			SendKeys.SendWait(keys);
			SendKeys.Flush();
			if (handle != IntPtr.Zero)
			{
				SetForegroundWindow(handle);
			}
		}
	}

	public static void GetModules(IntPtr handleid)
	{
		List<string> list = new List<string>();
		foreach (IntPtr item in EnumerateProcessWindowHandles((int)handleid))
		{
			StringBuilder stringBuilder = new StringBuilder(1000);
			SendMessage(item, 13u, stringBuilder.Capacity, stringBuilder);
			Console.WriteLine(stringBuilder);
			if (!list.Contains(stringBuilder.ToString()))
			{
				list.Add(stringBuilder.ToString());
			}
		}
	}

	public static void GetModules(string processname)
	{
		List<string> list = new List<string>();
		foreach (IntPtr item in EnumerateProcessWindowHandles(Process.GetProcessesByName(processname).First().Id))
		{
			StringBuilder stringBuilder = new StringBuilder(1000);
			SendMessage(item, 13u, stringBuilder.Capacity, stringBuilder);
			Console.WriteLine(stringBuilder);
			if (!list.Contains(stringBuilder.ToString()))
			{
				list.Add(stringBuilder.ToString());
			}
		}
	}

	public static void Send(string processname, ushort k)
	{
		Process[] processesByName = Process.GetProcessesByName("notepad++");
		if (processesByName.Length != 0 && processesByName[0] != null)
		{
			IntPtr hWnd = FindWindowEx(processesByName[0].MainWindowHandle, new IntPtr(0), "Edit", null);
			SendMessage(hWnd, 12u, (IntPtr)k, (IntPtr)0);
		}
	}

	public static void SendClick(Form form)
	{
		IntPtr handle = form.Handle;
		Process[] processesByName = Process.GetProcessesByName("SC_F2-EVO");
		SetForegroundWindow(handle);
		handle = processesByName[0].Handle;
		int lParam = 6553700;
		PostMessage(form.Handle, 513u, 200, lParam);
		PostMessage(form.Handle, 514u, 200, lParam);
	}

	public static void GetWindow()
	{
		Form form = new Form();
		Process process = Process.GetProcessesByName("PcanTrc").FirstOrDefault();
		if (process != null)
		{
			form.Hide();
			form.FormBorderStyle = FormBorderStyle.None;
			form.SetBounds(0, 0, 0, 0, BoundsSpecified.Location);
			IntPtr mainWindowHandle = process.MainWindowHandle;
			IntPtr handle = form.Handle;
			SetWindowLong(handle, -16, (int)((long)GetWindowLong(handle, -16) | 0x40000000L));
			IntPtr intPtr = SetParent(handle, mainWindowHandle);
			form.TopMost = true;
			form.Parent = form;
			form.Show();
		}
	}
}
