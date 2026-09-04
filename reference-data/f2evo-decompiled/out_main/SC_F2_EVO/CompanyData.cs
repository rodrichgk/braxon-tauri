using System.Reflection;
using System.Windows.Forms;

namespace SC_F2_EVO;

public class CompanyData
{
	public string BusinessName;

	public string Address;

	public string Province;

	public string Country;

	public string City;

	public string CAP;

	public string Prefix;

	public string VATNumber;

	public string Email;

	public string Fax;

	public string Mobile;

	public string Phone;

	public bool InsertLOGO;

	public CompanyData()
	{
	}

	public CompanyData(Form window)
	{
		FieldInfo[] fields = GetType().GetFields();
		foreach (FieldInfo fieldInfo in fields)
		{
			if (window.Controls[fieldInfo.Name] is TextBox)
			{
				fieldInfo.SetValue(this, window.Controls[fieldInfo.Name].Text);
			}
			if (window.Controls[fieldInfo.Name] is CheckBox)
			{
				fieldInfo.SetValue(this, ((CheckBox)window.Controls[fieldInfo.Name]).Checked);
			}
		}
	}

	public void SetData(Form window)
	{
		FieldInfo[] fields = GetType().GetFields();
		foreach (FieldInfo fieldInfo in fields)
		{
			object value = fieldInfo.GetValue(this);
			if (value != null)
			{
				if (window.Controls[fieldInfo.Name] is TextBox)
				{
					window.Controls[fieldInfo.Name].Text = value.ToString();
				}
				if (window.Controls[fieldInfo.Name] is CheckBox)
				{
					((CheckBox)window.Controls[fieldInfo.Name]).Checked = (bool)value;
				}
			}
		}
	}
}
