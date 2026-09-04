using System;
using System.CodeDom.Compiler;
using System.ComponentModel;
using System.Diagnostics;

namespace ElectronikSistem.WebServiceUpdateFirmWare;

[GeneratedCode("System.Web.Services", "4.8.9221.0")]
[DebuggerStepThrough]
[DesignerCategory("code")]
public class ListaCompletedEventArgs : AsyncCompletedEventArgs
{
	private object[] results;

	public string[] Result
	{
		get
		{
			RaiseExceptionIfNecessary();
			return (string[])results[0];
		}
	}

	internal ListaCompletedEventArgs(object[] results, Exception exception, bool cancelled, object userState)
		: base(exception, cancelled, userState)
	{
		this.results = results;
	}
}
