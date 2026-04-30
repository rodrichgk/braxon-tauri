// ABS data operations using server API
import * as api from './api';

export interface ABSDataItem {
  id?: string;
  partNumber: string;
  manufacturer: string;
  vehicleMake?: string;
  vehicleModel?: string;
  yearRange?: string;
  canSpeed?: string;
  canByte?: string;
  canIdLine?: string;
  canValue?: string;
  kLine?: string;
  absAdapter?: string;
  absConnector?: string;
  testValid?: boolean;
  testInfo?: string;
  comments?: string;
  otherReferences?: string;
}

export async function fetchABSData(): Promise<ABSDataItem[]> {
  try {
    return await api.fetchABSData();
  } catch (error) {
    console.error('Failed to fetch ABS data:', error);
    return [];
  }
}

export async function searchABSData(query: string): Promise<ABSDataItem[]> {
  try {
    return await api.searchABSData(query);
  } catch (error) {
    console.error('Failed to search ABS data:', error);
    return [];
  }
}

export async function updateABSDataItem(item: ABSDataItem): Promise<void> {
  if (!item.id) {
    throw new Error('Item ID is required for update');
  }
  await api.updateABSData(item.id, item);
}

export async function addABSDataItem(item: ABSDataItem): Promise<void> {
  await api.createABSData(item);
}

export async function deleteABSDataItem(id: string): Promise<void> {
  await api.deleteABSData(id);
}
