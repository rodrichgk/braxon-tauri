using System.Collections.Generic;
using System.Windows.Forms;

namespace SC_F2_EVO;

internal class ParametriABS
{
	public Parametri Values;

	public List<sbyte> Valves;

	public List<ParametriCiclo> Cicles;

	public List<ParametriTest> Test;

	public ParametriABS(TextBox CMax, TextBox CMin, TextBox WSup, TextBox WInf, TextBox PMax, TextBox PMin, TextBox PWork, TextBox PIni, TextBox PLow, TextBox PRtn, TextBox P4, TextBox P5, TextBox NRpt, TextBox Code, TextBox Temp, TextBox Res, byte TypeTest3)
	{
		Values = new Parametri();
		Values.C_Max = float.Parse(CMax.Text.Replace(".", ","), MainMenuForm.Culture);
		Values.C_Min = float.Parse(CMin.Text.Replace(".", ","), MainMenuForm.Culture);
		Values.W_Sup = float.Parse(WSup.Text.Replace(".", ","), MainMenuForm.Culture);
		Values.W_Inf = float.Parse(WInf.Text.Replace(".", ","), MainMenuForm.Culture);
		Values.P_Max = short.Parse(PMax.Text.Replace(".", ","));
		Values.P_Min = short.Parse(PMin.Text.Replace(".", ","));
		Values.P_Work = short.Parse(PWork.Text.Replace(".", ","));
		Values.P_Ini = short.Parse(PIni.Text.Replace(".", ","));
		Values.P_Low = short.Parse(PLow.Text.Replace(".", ","));
		Values.P_Rtn = short.Parse(PRtn.Text.Replace(".", ","));
		Values.Pulse4 = short.Parse(P4.Text.Replace(".", ","));
		Values.Pulse5 = short.Parse(P5.Text.Replace(".", ","));
		Values.Nrpt = short.Parse(NRpt.Text.Replace(".", ","));
		Values.CodiceABS = short.Parse(Code.Text);
		Values.Temperature = byte.Parse(Temp.Text.Replace(".", ","));
		Values.Resistor = short.Parse(Res.Text.Replace(".", ","));
		Values.TypeTest3 = TypeTest3;
		Valves = new List<sbyte>();
		Cicles = new List<ParametriCiclo>();
		Test = new List<ParametriTest>();
	}
}
