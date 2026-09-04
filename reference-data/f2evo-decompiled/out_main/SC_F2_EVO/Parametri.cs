namespace SC_F2_EVO;

internal class Parametri
{
	public string Model;

	public float C_Max;

	public float C_Min;

	public float W_Sup;

	public float W_Inf;

	public short P_Max;

	public short P_Min;

	public short P_Work;

	public short P_Ini;

	public short P_Low;

	public short P_Rtn;

	public short Pulse4;

	public short Pulse5;

	public short CodiceABS;

	public short Nrpt;

	public byte TypeTest3;

	public byte Temperature;

	public short Resistor;

	public sbyte[] Order = new sbyte[8] { 0, 1, 2, 3, 4, 5, 6, 7 };
}
