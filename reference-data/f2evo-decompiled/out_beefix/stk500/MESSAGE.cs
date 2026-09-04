using System;

namespace stk500;

[Serializable]
public struct MESSAGE
{
	public byte MessageStart;

	public byte SeguenceNumber;

	public byte MessageSize1;

	public byte MessageSize2;

	public byte TOKEN;
}
