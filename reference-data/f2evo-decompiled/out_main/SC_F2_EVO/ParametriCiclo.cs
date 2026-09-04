using System.Collections.Generic;

namespace SC_F2_EVO;

internal class ParametriCiclo
{
	public byte NCiclo;

	public bool C;

	public short P;

	public short m;

	public uint NPulses;

	public bool Pompa;

	public bool Motore;

	public List<sbyte> V;

	public ParametriCiclo()
	{
		V = new List<sbyte>();
	}
}
