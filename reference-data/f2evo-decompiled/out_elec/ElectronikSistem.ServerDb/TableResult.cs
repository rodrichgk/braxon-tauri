using System;
using System.CodeDom.Compiler;
using System.ComponentModel;
using System.Data;
using System.Diagnostics;
using System.Xml.Serialization;

namespace ElectronikSistem.ServerDb;

[Serializable]
[GeneratedCode("System.Xml", "4.8.9221.0")]
[DebuggerStepThrough]
[DesignerCategory("code")]
[XmlType(Namespace = "http://tempuri.org/")]
public class TableResult
{
	private DataSet datasetField;

	private string resultField;

	public DataSet dataset
	{
		get
		{
			return datasetField;
		}
		set
		{
			datasetField = value;
		}
	}

	public string result
	{
		get
		{
			return resultField;
		}
		set
		{
			resultField = value;
		}
	}
}
