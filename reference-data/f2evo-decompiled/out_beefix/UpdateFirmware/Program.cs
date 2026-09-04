using System;
using System.Diagnostics;
using System.Windows.Forms;
using ElectronikSistem;

namespace UpdateFirmware;

internal static class Program
{
	[STAThread]
	private static void Main()
	{
		string[] array = Environment.CommandLine.Split('-');
		Application.EnableVisualStyles();
		Application.SetCompatibleTextRenderingDefault(defaultValue: false);
		if (array.Length == 1 && !Debugger.IsAttached && !Prmission.IsRunAsAdmin())
		{
			Prmission.AdminRelauncher();
		}
		else
		{
			Application.Run(new MainForm());
		}
	}
}
