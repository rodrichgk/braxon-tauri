using System.CodeDom.Compiler;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.Resources;
using System.Runtime.CompilerServices;

namespace SC_F2_EVO.Properties;

[GeneratedCode("System.Resources.Tools.StronglyTypedResourceBuilder", "17.0.0.0")]
[DebuggerNonUserCode]
[CompilerGenerated]
internal class Resources
{
	private static ResourceManager resourceMan;

	private static CultureInfo resourceCulture;

	[EditorBrowsable(EditorBrowsableState.Advanced)]
	internal static ResourceManager ResourceManager
	{
		get
		{
			if (resourceMan == null)
			{
				ResourceManager resourceManager = new ResourceManager("SC_F2_EVO.Properties.Resources", typeof(Resources).Assembly);
				resourceMan = resourceManager;
			}
			return resourceMan;
		}
	}

	[EditorBrowsable(EditorBrowsableState.Advanced)]
	internal static CultureInfo Culture
	{
		get
		{
			return resourceCulture;
		}
		set
		{
			resourceCulture = value;
		}
	}

	internal static Bitmap Logo
	{
		get
		{
			object obj = ResourceManager.GetObject("Logo", resourceCulture);
			return (Bitmap)obj;
		}
	}

	internal static Bitmap SensorBackground
	{
		get
		{
			object obj = ResourceManager.GetObject("SensorBackground", resourceCulture);
			return (Bitmap)obj;
		}
	}

	internal static Bitmap SfondoH
	{
		get
		{
			object obj = ResourceManager.GetObject("SfondoH", resourceCulture);
			return (Bitmap)obj;
		}
	}

	internal static Bitmap VoltMeter
	{
		get
		{
			object obj = ResourceManager.GetObject("VoltMeter", resourceCulture);
			return (Bitmap)obj;
		}
	}

	internal Resources()
	{
	}
}
