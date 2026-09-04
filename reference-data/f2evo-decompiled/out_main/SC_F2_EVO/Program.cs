using System;
using System.Diagnostics;
using System.Windows.Forms;
using ElectronikSistem;

namespace SC_F2_EVO;

internal static class Program
{
	[STAThread]
	private static void Main()
	{
		Application.EnableVisualStyles();
		Application.SetCompatibleTextRenderingDefault(defaultValue: false);
		Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
		if (!Debugger.IsAttached && !Prmission.IsRunAsAdmin())
		{
			Prmission.AdminRelauncher();
		}
		else
		{
			Application.Run(new MainMenuForm());
		}
	}
}
