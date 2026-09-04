using System;
using System.CodeDom.Compiler;
using System.ComponentModel;
using System.Diagnostics;

namespace ElectronikSistem.ServerDb;

[GeneratedCode("System.Web.Services", "4.8.9221.0")]
[DebuggerStepThrough]
[DesignerCategory("code")]
public class TableCompletedEventArgs : AsyncCompletedEventArgs
{
	private object[] results;

	public TableResult Result
	{
		get
		{
			RaiseExceptionIfNecessary();
			return (TableResult)results[0];
		}
	}

	internal TableCompletedEventArgs(object[] results, Exception exception, bool cancelled, object userState)
		: base(exception, cancelled, userState)
	{
		this.results = results;
	}
}
