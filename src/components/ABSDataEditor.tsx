
import React, { useState, useEffect } from 'react';
import {
  ABSData,
  saveABSData,
  updateABSDataItem,
  addABSDataItem,
  deleteABSDataItem,
} from '@/lib/absData';

interface ABSDataEditorProps {
  data: ABSData[];
  onDataSaved: (newData: ABSData[]) => void;
}

export default function ABSDataEditor({
  data,
  onDataSaved,
}: ABSDataEditorProps) {
  const [editableData, setEditableData] = useState<ABSData[]>([]);
  const [selectedItem, setSelectedItem] = useState<ABSData | null>(
    null
  );
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editedItem, setEditedItem] = useState<ABSData | null>(
    null
  );
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [showEditor, setShowEditor] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [newItem, setNewItem] = useState<Partial<ABSData>>({
    reference: '',
    manufacturer: '',
    wssType: '',
    absAdapter: '',
    absConnector: '',
    canSpeed: '',
    canIdLine: '',
    canByte: '',
    canValue: '',
    comments: '',
    testValidated: '',
    otherReferences: '',
  });

  // Deep-copy input data for editing
  useEffect(() => {
    setEditableData(JSON.parse(JSON.stringify(data)));
  }, [data]);

  // Add keyboard shortcut handler for admin mode (Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Ctrl+K
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault(); // Prevent browser's default behavior
        setIsAdminMode(prev => {
          const newState = !prev;
          // Show a temporary message when admin mode changes
          setMessage({
            text: newState ? 'Admin mode activated. Delete buttons are now visible.' : 'Admin mode deactivated. Delete buttons are now hidden.',
            type: newState ? 'warning' : 'success'
          });
          setTimeout(() => setMessage({ text: '', type: '' }), 3000);
          return newState;
        });
      }
    };

    // Add event listener
    window.addEventListener('keydown', handleKeyDown);

    // Clean up
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const fields: (keyof ABSData)[] = [
    'reference',
    'manufacturer',
    'wssType',
    'absAdapter',
    'absConnector',
    'canSpeed',
    'canIdLine',
    'canByte',
    'canValue',
    'comments',
    'testValidated',
    'otherReferences',
  ];

  // Select an existing item to edit
  const handleSelectItem = (item: ABSData, index: number) => {
    setSelectedItem(item);
    setEditIndex(index);
    setEditedItem({ ...item });
  };

  // Update a field on the edited item
  const handleEditField = (field: keyof ABSData, value: string) => {
    if (!editedItem) return;
    setEditedItem({ ...editedItem, [field]: value });
  };

  // Save one item
  const handleSaveItem = async () => {
    if (editedItem == null || editIndex == null) return;
    setIsSaving(true);
    try {
      const success = await updateABSDataItem(editedItem);
      if (success) {
        const updated = [...editableData];
        updated[editIndex] = editedItem;
        setEditableData(updated);
        onDataSaved(updated);
        setMessage({
          text: 'Item updated successfully!',
          type: 'success',
        });
      } else {
        setMessage({
          text: 'Failed to update item in database.',
          type: 'error',
        });
      }
      setSelectedItem(null);
      setEditIndex(null);
      setEditedItem(null);
    } catch (err) {
      console.error(err);
      setMessage({
        text: 'An error occurred while saving.',
        type: 'error',
      });
    } finally {
      setIsSaving(false);
      setTimeout(() => setMessage({ text: '', type: '' }), 3000);
    }
  };

  const handleCancelEdit = () => {
    setSelectedItem(null);
    setEditIndex(null);
    setEditedItem(null);
  };

  // Add a brand-new item
  const handleAddItem = async () => {
    setIsSaving(true);
    try {
      const itemToAdd = {
        reference: newItem.reference || '',
        manufacturer: newItem.manufacturer || '',
        wssType: newItem.wssType || null,
        absAdapter: newItem.absAdapter || null,
        absConnector: newItem.absConnector || null,
        canSpeed: newItem.canSpeed || null,
        canIdLine: newItem.canIdLine || null,
        canByte: newItem.canByte || null,
        canValue: newItem.canValue || null,
        kLine: newItem.kLine || null,
        comments: newItem.comments || null,
        testValidated: newItem.testValidated || null,
        otherReferences: newItem.otherReferences || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      // Save to database
      const savedItem = await addABSDataItem(itemToAdd);
      
      if (savedItem) {
        // Add to local state with the real ID from the database
        setEditableData([...editableData, savedItem]);
        onDataSaved([...editableData, savedItem]);
        
        // Reset form
        setNewItem({
          reference: '',
          manufacturer: '',
          wssType: '',
          absAdapter: '',
          absConnector: '',
          canSpeed: '',
          canIdLine: '',
          canByte: '',
          canValue: '',
          comments: '',
          testValidated: '',
          otherReferences: '',
        });
        
        setMessage({
          text: 'New item added and saved to database!',
          type: 'success',
        });
        setShowEditor(false);
      } else {
        setMessage({
          text: 'Failed to add item to database.',
          type: 'error',
        });
      }
    } catch (err) {
      console.error(err);
      setMessage({
        text: 'An error occurred while adding the item.',
        type: 'error',
      });
    } finally {
      setIsSaving(false);
      setTimeout(() => setMessage({ text: '', type: '' }), 3000);
    }
  };

  const handleDeleteItem = async (index: number) => {
    if (!confirm('Are you sure you want to delete this item?'))
      return;
    
    const itemToDelete = editableData[index];
    
    // Check if this is a temporary item (not yet saved to DB)
    if (itemToDelete.id.startsWith('new-')) {
      // Just remove from local state
      const copy = [...editableData];
      copy.splice(index, 1);
      setEditableData(copy);
      onDataSaved(copy);
      setMessage({ text: 'Item removed.', type: 'success' });
      setTimeout(() => setMessage({ text: '', type: '' }), 3000);
      return;
    }
    
    // Otherwise, delete from database
    setIsSaving(true);
    try {
      const success = await deleteABSDataItem(itemToDelete.id);
      
      if (success) {
        // Remove from local state
        const copy = [...editableData];
        copy.splice(index, 1);
        setEditableData(copy);
        onDataSaved(copy);
        setMessage({ text: 'Item deleted from database.', type: 'success' });
      } else {
        setMessage({ text: 'Failed to delete item from database.', type: 'error' });
      }
    } catch (err) {
      console.error(err);
      setMessage({ text: 'An error occurred while deleting the item.', type: 'error' });
    } finally {
      setIsSaving(false);
      setTimeout(() => setMessage({ text: '', type: '' }), 3000);
    }
  };

  const handleNewItemFieldChange = (
    field: keyof ABSData,
    value: string
  ) => {
    setNewItem((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="card">
      <div className="flex justify-between items-center mb-4">
        <h2 className="card-header flex items-center">
          ABS Data Editor
        </h2>
        {isAdminMode && (
          <div className="status-warning px-3 py-1 rounded-full text-sm font-medium">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Admin Mode
          </div>
        )}
      </div>

      {message.text && (
        <div
          className={`alert ${
              message.type === 'success' ? 'alert-success' : 'alert-error'
            }`}
        >
          {message.text}
        </div>
      )}

      <div className="flex justify-end mb-4 space-x-2">
        <button
          onClick={() => setShowEditor((v) => !v)}
          className="btn-primary"
        >
          {showEditor ? 'Hide Editor' : 'Add New'}
        </button>
      </div>

      {showEditor && (
        <div className="mb-6 card">
          <h3 className="card-header">
            Add New ABS Data
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {fields.map((field) => (
              <div key={field}>
                <label className="input-label mb-1">
                  {field}
                </label>
                <input
                  type="text"
                  value={newItem[field as keyof ABSData] || ''}
                  onChange={(e) =>
                    handleNewItemFieldChange(
                      field as keyof ABSData,
                      e.target.value
                    )
                  }
                  className="input-field"
                />
              </div>
            ))}
          </div>
          <div className="mt-6 flex justify-end space-x-2">
            <button
              onClick={() => setShowEditor(false)}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleAddItem}
              className="btn-primary"
            >
              Add Item
            </button>
          </div>
        </div>
      )}

      {selectedItem && editedItem && (
        <div className="mb-6 card">
          <h3 className="card-header">
            Edit Item
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {fields.map((field) => (
              <div key={field}>
                <label className="input-label mb-1">
                  {field}
                </label>
                <input
                  type="text"
                  value={editedItem[field] || ''}
                  onChange={(e) =>
                    handleEditField(field, e.target.value)
                  }
                  className="input-field"
                />
              </div>
            ))}
          </div>
          <div className="mt-6 flex justify-end space-x-2">
            <button
              onClick={handleCancelEdit}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveItem}
              disabled={isSaving}
              className="btn-primary disabled:opacity-50"
            >
              {isSaving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      <div className="border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden shadow">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Reference
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Manufacturer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  WSS Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {editableData.map((item, idx) => (
                <tr
                  key={idx}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                    {item.reference}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                    {item.manufacturer}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                    {item.wssType}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => handleSelectItem(item, idx)}
                        className="
                          text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200
                          transition
                        "
                      >
                        Edit
                      </button>
                      {isAdminMode && (
                        <button
                          onClick={() => handleDeleteItem(idx)}
                          className="
                            text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-200
                            transition
                          "
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {editableData.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400"
                  >
                    No items found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        Showing {editableData.length} items
      </div>
    </div>
  );
}
