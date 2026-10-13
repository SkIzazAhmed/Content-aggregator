import { render, screen, fireEvent } from '@testing-library/react'
import { SearchBar } from '../../../src/renderer/src/components/SearchBar'

it('calls onChange when user types', () => {
  const onChange = vi.fn()
  render(<SearchBar value="" onChange={onChange} />)
  const input = screen.getByPlaceholderText(/search/i)
  fireEvent.change(input, { target: { value: 'typescript' } })
  expect(onChange).toHaveBeenCalledWith('typescript')
})

it('renders clear button when value is non-empty', () => {
  const onChange = vi.fn()
  render(<SearchBar value="typescript" onChange={onChange} />)
  expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument()
})
