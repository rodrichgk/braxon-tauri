using System;
using System.CodeDom.Compiler;
using System.ComponentModel;
using System.Diagnostics;

namespace ElectronikSistem.ServerDb;

[GeneratedCode("System.Web.Services", "4.8.9221.0")]
[DebuggerStepThrough]
[DesignerCategory("code")]
public class ExecuteNonQueryCompletedEventArgs : AsyncCompletedEventArgs
{
	private object[] results;

	public string Result
	{
		get
		{
			RaiseExceptionIfNecessary();
			return (string)results[0];
		}
	}

	internal ExecuteNonQueryCompletedEventArgs(object[] results, Exception exception, bool cancelled, object userState)
		: base(exception, cancelled, userState)
	{
		this.results = results;
	}
}
