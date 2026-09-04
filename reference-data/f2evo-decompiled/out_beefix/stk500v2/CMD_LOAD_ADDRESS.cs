using stk500;

namespace stk500v2;

public class CMD_LOAD_ADDRESS : MESSAGE_CMD
{
	public CMD_LOAD_ADDRESS(byte[] value, int address)
	{
		responselen = 8;
		base.address = address;
		CMD = new byte[5]
		{
			Constants_v2.CMD_LOAD_ADDRESS,
			value[0],
			value[1],
			value[2],
			value[3]
		};
	}
}
