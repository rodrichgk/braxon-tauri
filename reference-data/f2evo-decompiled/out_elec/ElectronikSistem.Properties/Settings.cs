using System.CodeDom.Compiler;
using System.Configuration;
using System.Diagnostics;
using System.Runtime.CompilerServices;

namespace ElectronikSistem.Properties;

[CompilerGenerated]
[GeneratedCode("Microsoft.VisualStudio.Editors.SettingsDesigner.SettingsSingleFileGenerator", "17.14.0.0")]
internal sealed class Settings : ApplicationSettingsBase
{
	private static Settings defaultInstance = (Settings)SettingsBase.Synchronized(new Settings());

	public static Settings Default => defaultInstance;

	[ApplicationScopedSetting]
	[DebuggerNonUserCode]
	[SpecialSetting(SpecialSetting.WebServiceUrl)]
	[DefaultSettingValue("http://localhost/UpdateFirmWare/UpdateFirmWare.asmx")]
	public string ElectronikSistem_WebServiceUpdateFirmWare_UpdateFirmWare => (string)this["ElectronikSistem_WebServiceUpdateFirmWare_UpdateFirmWare"];

	[ApplicationScopedSetting]
	[DebuggerNonUserCode]
	[SpecialSetting(SpecialSetting.WebServiceUrl)]
	[DefaultSettingValue("http://localhost/ServerDb/ServerDb.asmx")]
	public string ElectronikSistem_ServerDb_ServerDb => (string)this["ElectronikSistem_ServerDb_ServerDb"];
}
