using System;
using System.CodeDom.Compiler;
using System.ComponentModel;
using System.Diagnostics;
using System.Web.Services.Protocols;
using System.Xml;
using System.Xml.Serialization;

namespace ElectronikSistem.ServerDb;

[Serializable]
[GeneratedCode("System.Xml", "4.8.9221.0")]
[DebuggerStepThrough]
[DesignerCategory("code")]
[XmlType(Namespace = "http://tempuri.org/")]
[XmlRoot(Namespace = "http://tempuri.org/", IsNullable = false)]
public class LOGIN : SoapHeader
{
	private string userNameField;

	private string serialNumberField;

	private string deviceField;

	private string codeField;

	private XmlAttribute[] anyAttrField;

	public string UserName
	{
		get
		{
			return userNameField;
		}
		set
		{
			userNameField = value;
		}
	}

	public string SerialNumber
	{
		get
		{
			return serialNumberField;
		}
		set
		{
			serialNumberField = value;
		}
	}

	public string Device
	{
		get
		{
			return deviceField;
		}
		set
		{
			deviceField = value;
		}
	}

	public string Code
	{
		get
		{
			return codeField;
		}
		set
		{
			codeField = value;
		}
	}

	[XmlAnyAttribute]
	public XmlAttribute[] AnyAttr
	{
		get
		{
			return anyAttrField;
		}
		set
		{
			anyAttrField = value;
		}
	}
}
