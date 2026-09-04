using System;
using System.Data;
using System.Reflection;
using System.Web.Services.Description;

namespace SC_F2_EVO;

public class ReportE
{
	public int ID_CarsService;

	public byte Number;

	public DateTime Data;

	public string Operator;

	public string InternalCode;

	public string TypeOfTest;

	public string OEM_ABS;

	public string ISOCode;

	public string SoftwareVersion;

	public string HardwareVersion;

	public string TechnicalNotes;

	public bool TestResult;

	public double CurrentPeak;

	public double Voltage;

	public bool Comunication;

	public double FrontLeft1;

	public double FrontLeft2;

	public double FrontLeft3;

	public double FrontLeft4;

	public double FrontRight1;

	public double FrontRight2;

	public double FrontRight3;

	public double FrontRight4;

	public double RearLeft1;

	public double RearLeft2;

	public double RearLeft3;

	public double RearLeft4;

	public double RearRight1;

	public double RearRight2;

	public double RearRight3;

	public double RearRight4;

	public ReportE()
	{
	}

	public ReportE(DataRow row)
	{
		PropertyInfo[] properties = GetType().GetProperties();
		foreach (PropertyInfo propertyInfo in properties)
		{
			if (row[propertyInfo.Name] != DBNull.Value)
			{
				propertyInfo.SetValue(this, row[propertyInfo.Name]);
			}
		}
	}

	public DataRow ToDataRow(DataTable table)
	{
		if (table != null)
		{
			PropertyInfo[] properties = typeof(Operation).GetProperties();
			foreach (PropertyInfo propertyInfo in properties)
			{
				table.Columns.Add(propertyInfo.Name, propertyInfo.PropertyType);
			}
		}
		DataRow dataRow = table.NewRow();
		PropertyInfo[] properties2 = GetType().GetProperties();
		foreach (PropertyInfo propertyInfo2 in properties2)
		{
			object value = propertyInfo2.GetValue(this, null);
			if (value != null)
			{
				dataRow[propertyInfo2.Name] = value;
			}
		}
		return dataRow;
	}
}
